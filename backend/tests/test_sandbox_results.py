import unittest

from app.services.sandbox import compare_results


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
