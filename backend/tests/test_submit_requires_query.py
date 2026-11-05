import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.routers.problems import submit_query
from app.schemas import QueryRequest


class TestSubmitRequiresQuery(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id="problem")
        self.user = SimpleNamespace(id="user", role="instructor", last_streak_date=None, current_streak=0, longest_streak=0)

    @patch("app.routers.problems.run_sandbox")
    def test_empty_or_whitespace_query_never_creates_submission(self, sandbox):
        for query in ("", "   ", "\n\t  "):
            with self.subTest(query=query), self.assertRaises(HTTPException) as raised:
                submit_query("problem", QueryRequest(query=query), self.db, self.user)
            self.assertEqual(raised.exception.status_code, 400)
        sandbox.assert_not_called()
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()

    @patch("app.routers.problems.run_sandbox", return_value={"status": "Accepted"})
    def test_query_with_sql_can_be_submitted(self, sandbox):
        result = submit_query("problem", QueryRequest(query=" SELECT 1 "), self.db, self.user)
        self.assertEqual(result["score"], 100)
        self.assertEqual(sandbox.call_args.args[2], " SELECT 1 ")
        self.db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
