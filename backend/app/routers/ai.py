from fastapi import APIRouter, HTTPException, Depends
import logging
import os
import threading
import uuid
import httpx
from datetime import datetime
from google import genai
from google.genai import types
from app.schemas import AiChatRequest, AiChatResponse, AiChatSessionSchema, AiChatMessageSchema
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models import User, AiChatSession, AiChatMessage, Assignment, AssignmentProblem, AssignmentClass, ClassEnrollment
from app.services.ai_limits import (
    COOLDOWN,
    COOLDOWN_MESSAGE,
    MAX_OUTPUT_TOKENS,
    AiLimitError,
    CONTEXT_TURN_LIMIT,
    clip_text,
    enforce_prompt_size,
    enforce_usage,
    estimate_tokens,
    recent_turns,
)
from typing import List

router = APIRouter()
logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """Bạn là trợ lý giảng dạy môn Cơ sở dữ liệu. 
Bạn đóng vai trò hướng dẫn, gợi ý người dùng giải bài tập, tuyệt đối không được đưa code SQL cho người dùng copy, tuyệt đối không gợi ý code, mà hãy gợi ý hướng suy nghĩ để giải quyết vấn đề. 
Nếu người dùng yêu cầu code, hãy khéo léo từ chối và gợi ý phương pháp hoặc từ khóa SQL liên quan.
Dựa vào ngữ cảnh bài tập (tiêu đề, mô tả, yêu cầu, các bảng) và đoạn code hiện tại của sinh viên, hãy đưa ra gợi ý hướng giải quyết bài tập.
Trả lời ngắn gọn, súc tích và dễ hiểu."""

CODE_DRAFT_LIMIT = 2_000
PROBLEM_FIELD_LIMIT = 1_500
PROVIDER_BUSY = "Ask AI is busy right now. Please try again in a moment."
PROVIDER_FAILED = "Ask AI could not answer just now. Please try again."

_locks_guard = threading.Lock()
_user_locks: dict[str, threading.Lock] = {}
# Failed provider calls store no message, so the cooldown also has to
# remember every attempt that reached the model.
_last_provider_attempt: dict[str, datetime] = {}


def _lock_for(user_id: str) -> threading.Lock:
    with _locks_guard:
        lock = _user_locks.get(user_id)
        if lock is None:
            lock = threading.Lock()
            _user_locks[user_id] = lock
        return lock


def _problem_context(problem, code_draft: str) -> str:
    description = clip_text(problem.description, PROBLEM_FIELD_LIMIT)
    requirements = clip_text(problem.requirements, PROBLEM_FIELD_LIMIT)
    schema = clip_text(getattr(problem, "schema_sql", ""), PROBLEM_FIELD_LIMIT)
    draft = clip_text(code_draft, CODE_DRAFT_LIMIT)
    return (
        f"Problem: {problem.title}\n"
        f"Description: {description}\n"
        f"Requirements: {requirements}\n"
        f"Schema SQL:\n```sql\n{schema}\n```\n"
        f"\nStudent's current SQL draft:\n```sql\n{draft}\n```"
    )


def _provider_error(exc: Exception) -> HTTPException:
    text = str(exc)
    if "503" in text or "UNAVAILABLE" in text or "high demand" in text.lower():
        return HTTPException(status_code=503, detail=PROVIDER_BUSY)
    return HTTPException(status_code=502, detail=PROVIDER_FAILED)


def generate_ai_text(history: list[dict]) -> str:
    """Call the configured model with an already trimmed history."""

    provider = os.getenv("AI_PROVIDER", "gemini").strip().lower()
    if provider not in {"gemini", "upstage"}:
        raise HTTPException(status_code=500, detail="AI_PROVIDER must be 'gemini' or 'upstage'.")

    api_key = os.getenv("UPSTAGE_API_KEY" if provider == "upstage" else "GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail=f"{provider.upper()}_API_KEY is not configured on the server.")

    try:
        if provider == "gemini":
            client = genai.Client(api_key=api_key)
            gemini_history = [
                types.Content(
                    role="model" if item["role"] == "assistant" else "user",
                    parts=[types.Part.from_text(text=item["content"])],
                )
                for item in history
            ]
            response_text = client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
                contents=gemini_history,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                ),
            ).text
        else:
            base_url = os.getenv("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1").rstrip("/")
            model = os.getenv("UPSTAGE_MODEL", "solar-mini4")
            payload = {
                "model": model,
                "max_tokens": MAX_OUTPUT_TOKENS,
                "messages": [
                    {"role": "system", "content": SYSTEM_INSTRUCTION},
                    *history,
                ],
            }
            with httpx.Client(timeout=60.0) as client:
                api_response = client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=payload,
                )
            api_response.raise_for_status()
            response_text = api_response.json()["choices"][0]["message"]["content"]
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Ask AI provider call failed: %s", exc)
        raise _provider_error(exc) from exc

    if not response_text or not str(response_text).strip():
        raise HTTPException(status_code=502, detail=PROVIDER_FAILED)
    return str(response_text).strip()


def _reject_when_activity_blocks_ai(db: Session, current_user: User, problem_id: str) -> None:
    now = datetime.utcnow()
    active_restricted_assignments = db.query(Assignment).join(
        AssignmentProblem, AssignmentProblem.assignment_id == Assignment.id
    ).filter(
        AssignmentProblem.problem_id == problem_id,
        Assignment.published == True,
        Assignment.ai_allowed == False,
        (Assignment.opens == None) | (Assignment.opens <= now),
        (Assignment.closes == None) | (Assignment.closes > now)
    ).all()

    for activity in active_restricted_assignments:
        if activity.is_contest and activity.audience_type == "all_students" and current_user.status == "Active":
            blocked = True
        else:
            blocked = db.query(ClassEnrollment).join(
                AssignmentClass, AssignmentClass.class_id == ClassEnrollment.class_id
            ).filter(
                AssignmentClass.assignment_id == activity.id,
                ClassEnrollment.student_id == current_user.id,
            ).first() is not None
        if blocked:
            raise HTTPException(
                status_code=403,
                detail="Hệ thống phát hiện bạn đang trong thời gian làm Kỳ thi/Bài tập không cho phép dùng AI."
            )


@router.post("/chat", response_model=AiChatResponse)
async def chat_with_ai(
    request: AiChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        question = enforce_prompt_size(request.user_message)
    except AiLimitError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    _reject_when_activity_blocks_ai(db, current_user, request.problem_context.id)

    with _lock_for(current_user.id):
        try:
            now = datetime.utcnow()
            last_attempt = _last_provider_attempt.get(current_user.id)
            if last_attempt is not None and now - last_attempt < COOLDOWN:
                raise AiLimitError(429, COOLDOWN_MESSAGE)
            if request.session_id:
                session = db.query(AiChatSession).filter(
                    AiChatSession.id == request.session_id,
                    AiChatSession.user_id == current_user.id
                ).first()
                if not session:
                    raise HTTPException(status_code=404, detail="Chat session not found")
                previous = db.query(AiChatMessage).filter(
                    AiChatMessage.session_id == session.id
                ).order_by(AiChatMessage.created_at).all()
            else:
                session = AiChatSession(
                    id=str(uuid.uuid4()),
                    user_id=current_user.id,
                    problem_id=request.problem_context.id,
                )
                db.add(session)
                previous = []

            prior = recent_turns(previous, now)[-(CONTEXT_TURN_LIMIT - 1):]
            context_str = _problem_context(request.problem_context, request.code_draft)
            planned = (
                estimate_tokens(SYSTEM_INSTRUCTION)
                + estimate_tokens(context_str)
                + estimate_tokens(question)
                + sum(estimate_tokens(item.content) for item in prior)
                + MAX_OUTPUT_TOKENS
            )
            enforce_usage(db, current_user.id, planned, now)

            history = [
                {"role": "assistant" if item.role == "ai" else "user", "content": item.content}
                for item in prior
            ]
            history.append({"role": "user", "content": f"Context:\n{context_str}\n\nUser Question: {question}"})
            try:
                response_text = generate_ai_text(history)
            finally:
                finished = datetime.utcnow()
                _last_provider_attempt[current_user.id] = finished

            # SQL Server checks the message foreign key immediately, so the
            # session row has to exist before those inserts.
            db.flush()
            db.add(AiChatMessage(session_id=session.id, role="user", content=question, created_at=now))
            db.add(AiChatMessage(session_id=session.id, role="ai", content=response_text, created_at=finished))
            session.updated_at = finished
            db.commit()
            return AiChatResponse(response=response_text, session_id=session.id)
        except AiLimitError as exc:
            db.rollback()
            raise HTTPException(status_code=exc.status_code, detail=exc.detail)
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            logger.exception("Ask AI request failed")
            db.rollback()
            raise HTTPException(status_code=502, detail=PROVIDER_FAILED)


@router.get("/sessions/{problem_id}", response_model=List[AiChatSessionSchema])
def get_chat_sessions(
    problem_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sessions = db.query(AiChatSession).filter(
        AiChatSession.user_id == current_user.id,
        AiChatSession.problem_id == problem_id
    ).order_by(AiChatSession.created_at.desc()).all()
    return sessions

@router.get("/sessions/messages/{session_id}", response_model=List[AiChatMessageSchema])
def get_chat_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(AiChatSession).filter(
        AiChatSession.id == session_id,
        AiChatSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = db.query(AiChatMessage).filter(
        AiChatMessage.session_id == session_id
    ).order_by(AiChatMessage.created_at).all()

    return messages
