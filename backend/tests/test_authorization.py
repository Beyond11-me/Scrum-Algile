import unittest
from types import SimpleNamespace

from app.services.authorization import get_role_code, has_role, normalize_role_code


class TestAuthorizationHelpers(unittest.TestCase):
    def test_legacy_lecturer_role_is_normalized(self):
        self.assertEqual(normalize_role_code("Lecturer"), "instructor")

    def test_role_relation_has_priority_over_legacy_column(self):
        user = SimpleNamespace(role="student", role_entity=SimpleNamespace(code="admin"))
        self.assertEqual(get_role_code(user), "admin")

    def test_role_guard_accepts_a_matching_role(self):
        user = SimpleNamespace(role="instructor", role_entity=None)
        self.assertTrue(has_role(user, ("admin", "instructor")))


if __name__ == "__main__":
    unittest.main()
