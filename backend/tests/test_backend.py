import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models import User, Class
from app.routers.admin_classes import create_class, ClassCreatePayload
from app.routers.admin_users import create_admin_user, AdminUserCreate
from app.routers.admin_overview import get_overview_stats

class TestAdminFeatures(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.admin = self.db.query(User).filter(User.role == "admin").first()
        if not self.admin:
            self.admin = User(
                id="test_admin_01",
                name="Test Admin",
                initials="TA",
                email="admin_test@isql.local",
                hashed_password="testhashsecret",
                role="admin",
                status="Active"
            )
            self.db.add(self.admin)
            self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_create_class_with_semester_and_lecturerId(self):
        payload = ClassCreatePayload(
            id="TEST_CLS_01",
            course="Test DB Course",
            semester="HK1 2026",
            lecturerId="Unassigned"
        )
        res = create_class(payload, self.db, self.admin)
        self.assertEqual(res.id, "TEST_CLS_01")
        self.assertEqual(res.semester, "HK1 2026")
        self.assertEqual(res.lecturer, "Unassigned")

        # Clean up
        self.db.query(Class).filter(Class.id == "TEST_CLS_01").delete()
        self.db.commit()

    def test_create_class_with_term_and_instructor_id(self):
        payload = ClassCreatePayload(
            id="TEST_CLS_02",
            course="Test DB Course 2",
            term="Semester 2, 2026",
            instructor_id=None
        )
        res = create_class(payload, self.db, self.admin)
        self.assertEqual(res.id, "TEST_CLS_02")
        self.assertEqual(res.term, "Semester 2, 2026")

        # Clean up
        self.db.query(Class).filter(Class.id == "TEST_CLS_02").delete()
        self.db.commit()

    def test_create_user(self):
        test_email = "new_student_test@isql.local"
        # Ensure clean
        self.db.query(User).filter(User.email == test_email).delete()
        self.db.commit()

        user_payload = AdminUserCreate(
            name="New Test Student",
            email=test_email,
            role="Student",
            password="securepassword123"
        )
        created = create_admin_user(user_payload, self.db, self.admin)
        self.assertEqual(created.email, test_email)
        self.assertEqual(created.role, "Student")

        # Clean up
        self.db.query(User).filter(User.email == test_email).delete()
        self.db.commit()

    def test_overview_stats(self):
        stats = get_overview_stats(self.db, self.admin)
        self.assertGreaterEqual(stats.users, 0)

if __name__ == "__main__":
    unittest.main()
