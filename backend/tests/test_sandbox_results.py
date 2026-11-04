import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.sandbox import SandboxError, compare_results, run_sandbox


EXPECTED = {"name": "Result", "columns": ["id"], "rows": [[1]]}
ACTUAL = {"name": "Result", "columns": ["id"], "rows": [[2]]}


def run_with_case(is_hidden, is_submit=False, student_query_result=ACTUAL, allow_hidden=True):
    case = SimpleNamespace(id="case", is_hidden=is_hidden, expected_query="SELECT 1 AS id")
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [case]
    db.query.return_value.filter.return_value.first.return_value = MagicMock()
    with patch("app.services.sandbox.seed_sandbox_data_scripts"), patch(
        "app.services.sandbox.execute_query", side_effect=[EXPECTED, student_query_result]
    ):
        return run_sandbox(db, MagicMock(), "SELECT 2 AS id", is_submit=is_submit, allow_hidden=allow_hidden)


class TestSampleExpectedResult(unittest.TestCase):
    def test_run_returns_expected_result_of_a_visible_case(self):
        self.assertEqual(run_with_case(is_hidden=False)["expected"], EXPECTED)

    def test_run_never_returns_expected_result_of_a_hidden_case(self):
        result = run_with_case(is_hidden=True)
        self.assertEqual(result["table"], ACTUAL)
        self.assertIsNone(result["expected"])

    def test_student_run_of_hidden_only_problem_is_refused_without_expected_result(self):
        result = run_with_case(is_hidden=True, allow_hidden=False)
        self.assertEqual(result["message"], "This problem has no public test case to run.")
        self.assertNotIn("table", result)
        self.assertIsNone(result["expected"])

    def test_submit_does_not_return_expected_result(self):
        self.assertNotIn("expected", run_with_case(is_hidden=False, is_submit=True))

    def test_expected_result_is_kept_when_the_query_fails(self):
        result = run_with_case(is_hidden=False, student_query_result=SandboxError("bad sql"))
        self.assertEqual(result["status"], "Runtime Error")
        self.assertEqual(result["expected"], EXPECTED)


class TestSandboxResults(unittest.TestCase):
    def test_row_order_does_not_change_the_result(self):
        expected = {"columns": ["id"], "rows": [[1], [2]]}
        actual = {"columns": ["ID"], "rows": [[2], [1]]}
        self.assertTrue(compare_results(actual, expected)[0])

    def test_different_values_do_not_pass(self):
        expected = {"columns": ["id"], "rows": [[1]]}
        actual = {"columns": ["id"], "rows": [[2]]}
        self.assertFalse(compare_results(actual, expected)[0])


if __name__ == "__main__":
    unittest.main()
