import sys
import os
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException

from app.db.session import Base, SessionLocal, engine
from app.models import User, Class
from app.services.rbac import seed_rbac_catalogue
from app.routers.admin_classes import create_class, update_class, ClassCreatePayload, ClassUpdatePayload
from app.routers.admin_users import create_admin_user, AdminUserCreate
from app.routers.admin_overview import get_overview_stats
from app.core.security import verify_password

class TestAdminFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.db = SessionLocal()
        seed_rbac_catalogue(self.db)
        self.db.commit()
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
            semester="Semester 1, 2026",
            lecturerId="Unassigned"
        )
        res = create_class(payload, self.db, self.admin)
        self.assertEqual(res.id, "TEST_CLS_01")
        self.assertEqual(res.semester, "Semester 1, 2026")
        self.assertEqual(res.lecturer, "Unassigned")
        self.assertEqual(res.dates, "Unassigned")
        self.assertIsNone(res.start_date)
        self.assertIsNone(res.end_date)

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

    def test_create_class_stores_a_valid_date_range(self):
        payload = ClassCreatePayload(
            id="TEST_CLS_DATES",
            course="Scheduled course",
            semester="Semester 1, 2026",
            start_date="2026-09-07",
            end_date="2026-11-28",
        )
        res = create_class(payload, self.db, self.admin)
        self.assertEqual(res.dates, "Sep 07 – Nov 28, 2026")
        self.assertEqual(res.start_date, "2026-09-07")
        self.assertEqual(res.end_date, "2026-11-28")
        self.db.query(Class).filter(Class.id == "TEST_CLS_DATES").delete()
        self.db.commit()

    def test_create_class_rejects_dates_and_terms_outside_the_window(self):
        with self.assertRaises(HTTPException) as dates:
            create_class(ClassCreatePayload(
                id="TEST_CLS_BAD_DATE",
                course="Bad dates",
                semester="Semester 1, 2026",
                start_date="9999-01-01",
                end_date="9999-12-31",
            ), self.db, self.admin)
        self.assertEqual(dates.exception.status_code, 400)
        self.assertIn("2026 or 2027", dates.exception.detail)

        with self.assertRaises(HTTPException) as term:
            create_class(ClassCreatePayload(
                id="TEST_CLS_BAD_TERM",
                course="Bad term",
                semester="Semester 1, 2025",
            ), self.db, self.admin)
        self.assertEqual(term.exception.status_code, 400)
        self.assertIsNone(self.db.query(Class).filter(Class.id == "TEST_CLS_BAD_DATE").first())
        self.assertIsNone(self.db.query(Class).filter(Class.id == "TEST_CLS_BAD_TERM").first())

    def test_update_class_rejects_an_inverted_date_range(self):
        create_class(ClassCreatePayload(
            id="TEST_CLS_EDIT",
            course="Editable course",
            semester="Semester 1, 2026",
            start_date="2026-09-07",
            end_date="2026-11-28",
        ), self.db, self.admin)
        with self.assertRaises(HTTPException) as caught:
            update_class("TEST_CLS_EDIT", ClassUpdatePayload(
                start_date="2026-12-01",
                end_date="2026-09-01",
            ), self.db, self.admin)
        self.assertEqual(caught.exception.status_code, 400)
        stored = self.db.query(Class).filter(Class.id == "TEST_CLS_EDIT").one()
        self.assertEqual(stored.start_date, "2026-09-07")
        self.assertEqual(stored.end_date, "2026-11-28")
        self.db.delete(stored)
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
        )
        with patch("app.routers.admin_users.smtp_configured", return_value=True), patch(
            "app.routers.admin_users.send_initial_password"
        ) as send_mail:
            created = create_admin_user(user_payload, self.db, self.admin)
        self.assertEqual(created.email, test_email)
        self.assertEqual(created.role, "Student")
        self.assertEqual(created.email_delivery, "sent")
        send_mail.assert_called_once()
        sent_email, temporary_password = send_mail.call_args.args
        self.assertEqual(sent_email, test_email)
        stored = self.db.query(User).filter(User.email == test_email).one()
        self.assertTrue(verify_password(temporary_password, stored.hashed_password))
        self.assertTrue(stored.first_login_pending)

        # Clean up
        self.db.query(User).filter(User.email == test_email).delete()
        self.db.commit()

    def test_overview_stats(self):
        stats = get_overview_stats(self.db, self.admin)
        self.assertGreaterEqual(stats.users, 0)

if __name__ == "__main__":
    unittest.main()
