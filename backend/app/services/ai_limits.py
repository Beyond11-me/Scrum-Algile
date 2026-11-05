"""Per-student limits for Ask AI.

The shared model key is protected here, before any provider call. Query and
token totals are counted from messages already stored today. The context sent
to the model is only the most recent turns from the last half hour.
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import AiChatMessage, AiChatSession

MAX_PROMPT_WORDS = 120
MAX_PROMPT_CHARS = 1500
COOLDOWN = timedelta(seconds=8)
DAILY_QUERY_LIMIT = 15
DAILY_TOKEN_LIMIT = 12_000
CONTEXT_TURN_LIMIT = 6
CONTEXT_MAX_AGE = timedelta(minutes=30)
MAX_OUTPUT_TOKENS = 400

PROMPT_TOO_LONG = (
    f"Ask AI accepts up to {MAX_PROMPT_WORDS} words "
    f"({MAX_PROMPT_CHARS:,} characters) per question."
)
PROMPT_EMPTY = "Enter a question for Ask AI."
COOLDOWN_MESSAGE = "Wait a few seconds before asking Ask AI again."
QUERY_LIMIT_MESSAGE = f"You have reached today's limit of {DAILY_QUERY_LIMIT} Ask AI questions."
TOKEN_LIMIT_MESSAGE = "You have reached today's Ask AI usage limit. Try again tomorrow."


class AiLimitError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def estimate_tokens(text: str) -> int:
    """Rough token count used only to enforce the daily budget."""

    if not text:
        return 0
    return max(1, (len(text) + 3) // 4)


def clip_text(value: str | None, limit: int) -> str:
    value = value or ""
    if len(value) <= limit:
        return value
    return value[:limit].rstrip() + "…"


def enforce_prompt_size(text: str) -> str:
    """Return the trimmed question, or reject an empty or oversized one."""

    cleaned = (text or "").strip()
    if not cleaned:
        raise AiLimitError(400, PROMPT_EMPTY)
    if len(cleaned) > MAX_PROMPT_CHARS or len(cleaned.split()) > MAX_PROMPT_WORDS:
        raise AiLimitError(400, PROMPT_TOO_LONG)
    return cleaned


def recent_turns(messages, now: datetime, limit: int = CONTEXT_TURN_LIMIT):
    """Keep only recent messages, newest last, capped at ``limit``."""

    cutoff = now - CONTEXT_MAX_AGE
    fresh = []
    for message in messages:
        created = getattr(message, "created_at", None)
        if created is None or created >= cutoff:
            fresh.append(message)
    return fresh[-limit:]


def _today_messages(db: Session, user_id: str, now: datetime):
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(AiChatMessage)
        .join(AiChatSession, AiChatSession.id == AiChatMessage.session_id)
        .filter(AiChatSession.user_id == user_id, AiChatMessage.created_at >= start)
        .all()
    )


def enforce_usage(db: Session, user_id: str, incoming_tokens: int, now: datetime) -> None:
    """Reject a question that breaks the cooldown, daily query cap, or token budget."""

    messages = _today_messages(db, user_id, now)
    user_messages = [message for message in messages if message.role == "user"]
    if len(user_messages) >= DAILY_QUERY_LIMIT:
        raise AiLimitError(429, QUERY_LIMIT_MESSAGE)

    latest = (
        db.query(AiChatMessage.created_at)
        .join(AiChatSession, AiChatSession.id == AiChatMessage.session_id)
        .filter(AiChatSession.user_id == user_id)
        .order_by(AiChatMessage.created_at.desc())
        .first()
    )
    if latest is not None and latest[0] is not None and now - latest[0] < COOLDOWN:
        raise AiLimitError(429, COOLDOWN_MESSAGE)

    used = sum(estimate_tokens(message.content) for message in messages)
    if used + max(incoming_tokens, 0) > DAILY_TOKEN_LIMIT:
        raise AiLimitError(429, TOKEN_LIMIT_MESSAGE)
