import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models import ActivityLog, Class, ClassEnrollment, User
from app.services.roster_import import (
    STATUS_ADDED,
    STATUS_INACTIVE,
    STATUS_NOT_FOUND,
    STATUS_NOT_STUDENT,
    build_roster_report,
    classify_roster_token,
    enroll_from_roster,
    parse_roster_csv,
    roster_report_filename,
)


class TestRosterImport(unittest.TestCase):
    def test_parses_a_simple_email_table(self):
        raw = (
            "email\n"
            "21520001@gm.uit.edu.vn\n"
            "\n"
            "21520001@GM.UIT.EDU.VN\n"
            "21520002@gm.uit.edu.vn\n"
        ).encode()
        self.assertEqual(
            parse_roster_csv(raw),
            ["21520001@gm.uit.edu.vn", "21520002@gm.uit.edu.vn"],
        )

    def test_parses_a_headerless_list(self):
        raw = "21520003@gm.uit.edu.vn\n21520004@gm.uit.edu.vn\n".encode()
        self.assertEqual(
            parse_roster_csv(raw),
            ["21520003@gm.uit.edu.vn", "21520004@gm.uit.edu.vn"],
        )

    def test_unknown_email_is_not_found(self):
        self.assertEqual(
            classify_roster_token("2152000@gm.uit.edu.vn", user_role=None, user_status=None, already_enrolled=False),
            ("2152000@gm.uit.edu.vn", STATUS_NOT_FOUND),
        )
        self.assertEqual(
            classify_roster_token("student@demo.local", user_role=None, user_status=None, already_enrolled=False),
            ("student@demo.local", STATUS_NOT_FOUND),
        )

    def test_missing_account_and_existing_member(self):
        self.assertEqual(
            classify_roster_token("21520009@gm.uit.edu.vn", user_role=None, user_status=None, already_enrolled=False),
            ("21520009@gm.uit.edu.vn", STATUS_NOT_FOUND),
        )
        self.assertEqual(
            classify_roster_token("21520001@gm.uit.edu.vn", user_role="student", user_status="Active", already_enrolled=True),
            ("21520001@gm.uit.edu.vn", STATUS_ADDED),
        )
        email, outcome = classify_roster_token(
            "21520008@GM.UIT.EDU.VN",
            user_role="student",
            user_status="Active",
            already_enrolled=False,
        )
        self.assertEqual(email, "21520008@gm.uit.edu.vn")
        self.assertIsNone(outcome)

    def test_result_csv_keeps_both_statuses(self):
        report = build_roster_report([
            ("21520009@gm.uit.edu.vn", STATUS_NOT_FOUND),
            ("21520001@gm.uit.edu.vn", STATUS_ADDED),
        ])
        self.assertEqual(
            report,
            "email,status\r\n"
            "21520009@gm.uit.edu.vn,not found\r\n"
            "21520001@gm.uit.edu.vn,added\r\n",
        )
        self.assertEqual(build_roster_report([]), "email,status\r\n")

    def test_inactive_and_non_student_accounts(self):
        self.assertEqual(
            classify_roster_token("21520002@gm.uit.edu.vn", user_role="student", user_status="Inactive", already_enrolled=False),
            ("21520002@gm.uit.edu.vn", STATUS_INACTIVE),
        )
        self.assertEqual(
            classify_roster_token("lecturer@demo.local", user_role="instructor", user_status="Active", already_enrolled=False),
            ("lecturer@demo.local", STATUS_NOT_STUDENT),
        )

    def test_parses_other_layouts(self):
        bom_table = "\ufeffname,email\nLan,21520005@gm.uit.edu.vn\n".encode("utf-8")
        self.assertEqual(parse_roster_csv(bom_table), ["21520005@gm.uit.edu.vn"])
        semicolon = "email;name\n21520006@gm.uit.edu.vn;An\n".encode()
        self.assertEqual(parse_roster_csv(semicolon), ["21520006@gm.uit.edu.vn"])
        tabs = "student_id\tname\n21520007@gm.uit.edu.vn\tBinh\n".encode()
        self.assertEqual(parse_roster_csv(tabs), ["21520007@gm.uit.edu.vn"])

    def test_report_filename_strips_unsafe_characters(self):
        self.assertEqual(roster_report_filename("IS201.R11"), "IS201.R11-roster-import-result.csv")
        self.assertEqual(roster_report_filename("IS201/R11"), "IS201_R11-roster-import-result.csv")
        self.assertEqual(roster_report_filename("///"), "class-roster-import-result.csv")


class TestEnrollFromRoster(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(Class(id="IS201.R11", course="Database", term="Semester 1, 2026"))
        self.db.add_all([
            self._user("teacher-1", "teacher@demo.local", "instructor", "Active"),
            self._user("student-1", "21520001@gm.uit.edu.vn", "student", "Active"),
            self._user("student-2", "21520002@gm.uit.edu.vn", "student", "Inactive"),
            self._user("student-4", "21520004@gm.uit.edu.vn", "student", "Active"),
            self._user("lecturer-1", "lecturer@demo.local", "instructor", "Active"),
        ])
        self.db.add(ClassEnrollment(class_id="IS201.R11", student_id="student-4", role="Member"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _user(self, user_id, email, role, status):
        return User(
            id=user_id,
            email=email,
            hashed_password="not-used",
            name=email,
            initials="T",
            role=role,
            status=status,
        )

    def test_enrolls_only_new_active_students(self):
        raw = (
            "email\n"
            "21520001@gm.uit.edu.vn\n"
            "21520002@gm.uit.edu.vn\n"
            "lecturer@demo.local\n"
            "21520004@gm.uit.edu.vn\n"
            "21520009@gm.uit.edu.vn\n"
            "21520001@GM.UIT.EDU.VN\n"
        ).encode()
        outcome = enroll_from_roster(self.db, "IS201.R11", raw, "teacher-1")

        self.assertEqual(outcome.enrolled, 1)
        self.assertEqual(outcome.added, 1)
        self.assertEqual(outcome.not_found, 1)
        self.assertEqual(outcome.report_rows, 4)
        self.assertEqual(outcome.filename, "IS201.R11-roster-import-result.csv")
        enrolled_ids = {
            row.student_id
            for row in self.db.query(ClassEnrollment).filter(ClassEnrollment.class_id == "IS201.R11")
        }
        self.assertEqual(enrolled_ids, {"student-1", "student-4"})
        log = self.db.query(ActivityLog).one()
        self.assertEqual(log.user_id, "teacher-1")
        self.assertIn("Imported 1 students", log.action)
        self.assertIn("21520009@gm.uit.edu.vn,not found", outcome.report_csv)
        self.assertIn("21520002@gm.uit.edu.vn,inactive", outcome.report_csv)
        self.assertIn("lecturer@demo.local,not a student", outcome.report_csv)
        self.assertIn("21520004@gm.uit.edu.vn,added", outcome.report_csv)

    def test_empty_file_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "empty"):
            enroll_from_roster(self.db, "IS201.R11", b"", "teacher-1")
        with self.assertRaisesRegex(ValueError, "No student emails"):
            enroll_from_roster(self.db, "IS201.R11", b"email\n\n", "teacher-1")
        self.assertEqual(self.db.query(ClassEnrollment).count(), 1)


if __name__ == "__main__":
    unittest.main()
