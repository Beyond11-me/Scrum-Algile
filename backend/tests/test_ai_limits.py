"""Ask AI limits: prompt size, cooldown, daily query and token budgets, and recent context."""

import asyncio
import unittest
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.db.session import Base, SessionLocal, engine
from app.models import AiChatMessage, AiChatSession, Problem, User
from app.routers.ai import _provider_error, chat_with_ai
from app.schemas import AiChatRequest, ProblemDetailResponse
from app.services.ai_limits import (
    COOLDOWN_MESSAGE,
    DAILY_QUERY_LIMIT,
    DAILY_TOKEN_LIMIT,
    PROMPT_TOO_LONG,
    QUERY_LIMIT_MESSAGE,
    TOKEN_LIMIT_MESSAGE,
    AiLimitError,
    enforce_prompt_size,
    enforce_usage,
    recent_turns,
)


def _message(content, created, role="user"):
    return SimpleNamespace(role=role, content=content, created_at=created)


class TestPromptAndContextRules(unittest.TestCase):
    def test_question_at_the_word_limit_is_allowed(self):
        question = " ".join(["word"] * 120)
        self.assertEqual(enforce_prompt_size(question), question)

    def test_question_over_the_word_limit_is_rejected(self):
        question = " ".join(["I", "don't", "know"] * 80)
        with self.assertRaises(AiLimitError) as caught:
            enforce_prompt_size(question)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, PROMPT_TOO_LONG)

    def test_question_over_the_character_limit_is_rejected(self):
        with self.assertRaises(AiLimitError) as caught:
            enforce_prompt_size("a" * 1501)
        self.assertEqual(caught.exception.detail, PROMPT_TOO_LONG)

    def test_old_replies_are_left_out_of_the_model_context(self):
        now = datetime(2026, 11, 5, 9, 0, 0)
        messages = [_message("OLD-REPLY", now - timedelta(hours=2), role="ai")]
        messages.extend(
            _message(f"RECENT-{index}", now - timedelta(minutes=10 - index), role="user" if index % 2 == 0 else "ai")
            for index in range(6)
        )
        kept = recent_turns(messages, now)
        self.assertNotIn("OLD-REPLY", [item.content for item in kept])
        self.assertEqual([item.content for item in kept], [f"RECENT-{index}" for index in range(6)])
        self.assertEqual([item.content for item in kept[-(6 - 1):]], [f"RECENT-{index}" for index in range(1, 6)])

    def test_provider_overload_is_not_shown_as_raw_json(self):
        error = _provider_error(RuntimeError(
            "503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high demand.'}}"
        ))
        self.assertEqual(error.status_code, 503)
        self.assertNotIn("{", error.detail)
        self.assertNotIn("UNAVAILABLE", error.detail)


class TestAskAiQuota(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.db = SessionLocal()
        self.suffix = uuid.uuid4().hex[:10]
        self.student = User(
            id=f"ai-student-{self.suffix}",
            email=f"ai-student-{self.suffix}@test.invalid",
            name="Ai Student",
            initials="AS",
            hashed_password="x",
            role="student",
            status="Active",
        )
        self.problem = Problem(
            id=f"ai-problem-{self.suffix}",
            number="AI-1",
            title="Customer directory",
            difficulty="Easy",
            description="List every customer.",
            requirements="Return customer_id and customer_name.",
            practice_listed=True,
        )
        self.db.add_all([self.student, self.problem])
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        session_ids = [
            row[0] for row in self.db.query(AiChatSession.id).filter(AiChatSession.user_id == self.student.id)
        ]
        if session_ids:
            self.db.query(AiChatMessage).filter(AiChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
            self.db.query(AiChatSession).filter(AiChatSession.id.in_(session_ids)).delete(synchronize_session=False)
        self.db.query(Problem).filter(Problem.id == self.problem.id).delete(synchronize_session=False)
        self.db.query(User).filter(User.id == self.student.id).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def request(self, question, session_id=None):
        return AiChatRequest(
            problem_context=ProblemDetailResponse(
                id=self.problem.id,
                number=self.problem.number,
                title=self.problem.title,
                difficulty="Easy",
                practice_listed=True,
                description=self.problem.description,
                requirements=self.problem.requirements,
            ),
            code_draft="SELECT customer_id FROM Customers",
            user_message=question,
            session_id=session_id,
        )

    def add_user_message(self, content, created):
        chat = AiChatSession(
            id=str(uuid.uuid4()),
            user_id=self.student.id,
            problem_id=self.problem.id,
            created_at=created,
        )
        self.db.add(chat)
        self.db.flush()
        self.db.add(AiChatMessage(
            id=str(uuid.uuid4()),
            session_id=chat.id,
            role="user",
            content=content,
            created_at=created,
        ))

    def test_cooldown_blocks_a_second_question(self):
        now = datetime.utcnow()
        self.add_user_message("Which columns should I return?", now - timedelta(seconds=2))
        self.db.commit()
        with self.assertRaises(AiLimitError) as caught:
            enforce_usage(self.db, self.student.id, 100, now)
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.detail, COOLDOWN_MESSAGE)

    def test_daily_query_limit_blocks_the_next_question(self):
        now = datetime.utcnow()
        for index in range(DAILY_QUERY_LIMIT):
            self.add_user_message("How do I filter rows?", now - timedelta(minutes=index + 1))
        self.db.commit()
        with self.assertRaises(AiLimitError) as caught:
            enforce_usage(self.db, self.student.id, 100, now)
        self.assertEqual(caught.exception.detail, QUERY_LIMIT_MESSAGE)

    def test_daily_token_budget_blocks_a_large_day(self):
        now = datetime.utcnow()
        self.add_user_message("x" * (DAILY_TOKEN_LIMIT * 4), now - timedelta(minutes=5))
        self.db.commit()
        with self.assertRaises(AiLimitError) as caught:
            enforce_usage(self.db, self.student.id, 1, now)
        self.assertEqual(caught.exception.detail, TOKEN_LIMIT_MESSAGE)

    def test_long_prompt_is_rejected_before_the_model_is_called(self):
        question = "I don't know " * 80
        with patch("app.routers.ai.generate_ai_text") as generate:
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(chat_with_ai(self.request(question), self.db, self.student))
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, PROMPT_TOO_LONG)
        generate.assert_not_called()
        stored = self.db.query(AiChatMessage).join(AiChatSession).filter(AiChatSession.user_id == self.student.id).count()
        self.assertEqual(stored, 0)

    def test_model_receives_only_recent_turns(self):
        now = datetime.utcnow()
        chat = AiChatSession(id=str(uuid.uuid4()), user_id=self.student.id, problem_id=self.problem.id, created_at=now - timedelta(hours=3))
        self.db.add(chat)
        self.db.flush()
        self.db.add(AiChatMessage(
            id=str(uuid.uuid4()), session_id=chat.id, role="ai", content="OLD-REPLY",
            created_at=now - timedelta(hours=2),
        ))
        for index in range(6):
            self.db.add(AiChatMessage(
                id=str(uuid.uuid4()),
                session_id=chat.id,
                role="user" if index % 2 == 0 else "ai",
                content=f"RECENT-{index}",
                created_at=now - timedelta(minutes=10 - index),
            ))
        self.db.commit()

        seen = {}

        def fake_reply(history):
            seen["history"] = history
            return "Start with the columns named in the requirements."

        with patch("app.routers.ai.generate_ai_text", side_effect=fake_reply):
            asyncio.run(chat_with_ai(self.request("Which columns matter?", chat.id), self.db, self.student))

        sent = "\n".join(item["content"] for item in seen["history"])
        self.assertNotIn("OLD-REPLY", sent)
        self.assertNotIn("RECENT-0", sent)
        self.assertIn("RECENT-5", sent)
        self.assertIn("Which columns matter?", sent)

    def test_second_question_in_a_few_seconds_is_rejected(self):
        with patch("app.routers.ai.generate_ai_text", return_value="Look at the requested columns.") as generate:
            asyncio.run(chat_with_ai(self.request("Which columns matter?"), self.db, self.student))
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(chat_with_ai(self.request("And how should I sort them?"), self.db, self.student))
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.detail, COOLDOWN_MESSAGE)
        generate.assert_called_once()

    def test_failed_model_call_still_starts_the_cooldown(self):
        busy = HTTPException(status_code=503, detail="Ask AI is busy right now. Please try again in a moment.")
        with patch("app.routers.ai.generate_ai_text", side_effect=busy) as generate:
            with self.assertRaises(HTTPException) as first:
                asyncio.run(chat_with_ai(self.request("Which columns matter?"), self.db, self.student))
            with self.assertRaises(HTTPException) as second:
                asyncio.run(chat_with_ai(self.request("Which columns matter?"), self.db, self.student))
        self.assertEqual(first.exception.status_code, 503)
        self.assertEqual(second.exception.status_code, 429)
        generate.assert_called_once()

    def test_cooldown_counts_from_when_the_reply_finished(self):
        def slow_reply(history):
            return "Look at the requested columns."

        with patch("app.routers.ai.generate_ai_text", side_effect=slow_reply):
            asyncio.run(chat_with_ai(self.request("Which columns matter?"), self.db, self.student))
        reply = (
            self.db.query(AiChatMessage).join(AiChatSession)
            .filter(AiChatSession.user_id == self.student.id, AiChatMessage.role == "ai")
            .one()
        )
        question = (
            self.db.query(AiChatMessage).join(AiChatSession)
            .filter(AiChatSession.user_id == self.student.id, AiChatMessage.role == "user")
            .one()
        )
        self.assertGreaterEqual(reply.created_at, question.created_at)
        with self.assertRaises(AiLimitError) as caught:
            enforce_usage(self.db, self.student.id, 100, reply.created_at + timedelta(seconds=3))
        self.assertEqual(caught.exception.detail, COOLDOWN_MESSAGE)


if __name__ == "__main__":
    unittest.main()
