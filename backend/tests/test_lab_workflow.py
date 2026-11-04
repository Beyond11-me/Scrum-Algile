"""Acceptance coverage for instructor-created Labs assigned to practical classes."""

import asyncio
import unittest
import uuid
from datetime import datetime, timedelta

import httpx
from fastapi import HTTPException

from app.core.security import create_access_token
from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models import (
    Assignment,
    AssignmentClass,
    AssignmentProblem,
    ActivityLog,
    Class,
    ClassEnrollment,
    Notification,
    Problem,
    Submission,
    User,
)
from app.routers.assignments import create_assignment, get_assignment, update_assignment
from app.routers.problems import get_problem
from app.routers.student_assignments import get_student_assignments
from app.schemas import AssignmentCreate


class TestLabWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.db = SessionLocal()
        self.suffix = uuid.uuid4().hex[:10]
        self.teacher = User(
            id=f"lab-teacher-{self.suffix}", email=f"lab-teacher-{self.suffix}@test.invalid",
            name="Lab Teacher", initials="LT", hashed_password="x", role="instructor", status="Active",
        )
        self.student_one = User(
            id=f"lab-student-one-{self.suffix}", email=f"lab-one-{self.suffix}@test.invalid",
            name="Student One", initials="S1", hashed_password="x", role="student", status="Active",
        )
        self.student_two = User(
            id=f"lab-student-two-{self.suffix}", email=f"lab-two-{self.suffix}@test.invalid",
            name="Student Two", initials="S2", hashed_password="x", role="student", status="Active",
        )
        self.other_teacher = User(
            id=f"lab-other-teacher-{self.suffix}", email=f"lab-other-{self.suffix}@test.invalid",
            name="Other Teacher", initials="OT", hashed_password="x", role="instructor", status="Active",
        )
        self.class_one = Class(
            id=f"IS207.021.1-{self.suffix}", course="Database Systems", term="Semester 1, 2026",
            instructor_id=self.teacher.id, status="Active",
        )
        self.class_two = Class(
            id=f"IS207.021.2-{self.suffix}", course="Database Systems", term="Semester 1, 2026",
            instructor_id=self.teacher.id, status="Active",
        )
        self.archived_class = Class(
            id=f"IS207.021.3-{self.suffix}", course="Database Systems", term="Semester 1, 2026",
            instructor_id=self.teacher.id, status="Archived",
        )
        self.other_class = Class(
            id=f"IS207.021.4-{self.suffix}", course="Database Systems", term="Semester 1, 2026",
            instructor_id=self.other_teacher.id, status="Active",
        )
        self.problem = Problem(
            id=f"lab-question-{self.suffix}", number="LAB-01", title="Lab question", topic="SELECT",
            topics=["SELECT"], difficulty="Easy", description="Return one row.", requirements="",
            practice_listed=False, creator_id=self.teacher.id,
        )
        # ``Class`` does not declare an ORM relationship to ``User``.  Flush
        # the referenced accounts first so this fixture also works on SQL Server
        # where the foreign key is enforced immediately.
        self.db.add_all([self.teacher, self.student_one, self.student_two, self.other_teacher])
        self.db.flush()
        self.db.add_all([self.class_one, self.class_two, self.archived_class, self.other_class, self.problem])
        self.db.flush()
        self.db.add_all([
            ClassEnrollment(class_id=self.class_one.id, student_id=self.student_one.id),
            ClassEnrollment(class_id=self.class_two.id, student_id=self.student_two.id),
        ])
        self.db.commit()

    def tearDown(self):
        # The assignment router records activity logs.  Remove these first so
        # SQL Server can delete the isolated fixture users without leaving a
        # failed transaction that affects the next acceptance case.
        self.db.query(ActivityLog).filter(ActivityLog.user_id == self.teacher.id).delete(synchronize_session=False)
        self.db.query(Submission).filter(Submission.user_id.in_([self.student_one.id, self.student_two.id])).delete(synchronize_session=False)
        assignment_ids = [row[0] for row in self.db.query(Assignment.id).filter(Assignment.instructor_id == self.teacher.id).all()]
        if assignment_ids:
            self.db.query(AssignmentClass).filter(AssignmentClass.assignment_id.in_(assignment_ids)).delete(synchronize_session=False)
            self.db.query(AssignmentProblem).filter(AssignmentProblem.assignment_id.in_(assignment_ids)).delete(synchronize_session=False)
            self.db.query(Assignment).filter(Assignment.id.in_(assignment_ids)).delete(synchronize_session=False)
        self.db.query(Notification).filter(Notification.user_id.in_([self.student_one.id, self.student_two.id])).delete(synchronize_session=False)
        self.db.query(ClassEnrollment).filter(ClassEnrollment.class_id.in_([self.class_one.id, self.class_two.id])).delete(synchronize_session=False)
        self.db.query(Problem).filter(Problem.id == self.problem.id).delete(synchronize_session=False)
        self.db.query(Class).filter(Class.id.in_([self.class_one.id, self.class_two.id, self.archived_class.id, self.other_class.id])).delete(synchronize_session=False)
        self.db.query(User).filter(User.id.in_([self.teacher.id, self.student_one.id, self.student_two.id, self.other_teacher.id])).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def payload(self, **overrides) -> AssignmentCreate:
        data = {
            "title": "Lab 01",
            "isContest": False,
            "classIds": [self.class_one.id],
            "audienceType": "classes",
            "instructions": "Complete every question.",
            "opens": "2026-11-10T08:00:00+07:00",
            "closes": "2026-11-10T23:59:00+07:00",
            "problems": [{"id": self.problem.id, "points": 10}],
            "studentOptions": {"hints": True, "comments": True, "aiAllowed": True},
            "published": True,
        }
        data.update(overrides)
        return AssignmentCreate.model_validate(data)

    def create_lab(self, **overrides):
        return create_assignment(self.payload(**overrides), self.db, self.teacher)

    def test_vietnam_schedule_preserves_a_2359_deadline(self):
        request = self.payload()
        self.assertEqual(request.opens, datetime(2026, 11, 10, 1, 0))
        self.assertEqual(request.closes, datetime(2026, 11, 10, 16, 59))
        created = self.create_lab()
        stored = self.db.query(Assignment).filter(Assignment.id == created["id"]).one()
        self.assertEqual(stored.closes, datetime(2026, 11, 10, 16, 59))

    def test_scheduled_lab_hides_questions_then_open_lab_shows_them(self):
        created = self.create_lab()
        stored = self.db.query(Assignment).filter(Assignment.id == created["id"]).one()
        stored.opens = datetime.utcnow() + timedelta(minutes=10)
        stored.closes = datetime.utcnow() + timedelta(days=1)
        self.db.commit()

        scheduled = get_assignment(stored.id, self.db, self.student_one)
        self.assertEqual(scheduled["status"], "Scheduled")
        self.assertEqual(scheduled["problemList"], [])
        listed = get_student_assignments(self.db, self.student_one)
        self.assertEqual(listed["assignments"][0]["problemIds"], [])
        self.assertEqual(listed["assignments"][0]["title"], "Lab 01")

        stored.opens = datetime.utcnow() - timedelta(minutes=10)
        self.db.commit()
        opened = get_assignment(stored.id, self.db, self.student_one)
        self.assertEqual(opened["status"], "Open")
        self.assertEqual(opened["problemList"], [{"id": self.problem.id, "points": 10}])

    def test_lab_isolated_between_practical_class_sections(self):
        created = self.create_lab()
        with self.assertRaises(HTTPException) as denied:
            get_assignment(created["id"], self.db, self.student_two)
        self.assertEqual(denied.exception.status_code, 403)

    def test_publish_rejects_missing_or_invalid_class_and_question(self):
        before = self.db.query(Assignment).filter(Assignment.instructor_id == self.teacher.id).count()
        with self.assertRaises(HTTPException) as no_class:
            self.create_lab(classIds=[])
        self.assertEqual(no_class.exception.status_code, 400)
        with self.assertRaises(HTTPException) as no_question:
            self.create_lab(problems=[])
        self.assertEqual(no_question.exception.status_code, 400)
        with self.assertRaises(HTTPException) as archived_class:
            self.create_lab(classIds=[self.archived_class.id])
        self.assertEqual(archived_class.exception.status_code, 400)
        self.assertEqual(self.db.query(Assignment).filter(Assignment.instructor_id == self.teacher.id).count(), before)

    def test_lab_title_requires_three_to_one_hundred_characters(self):
        for title in ("", "ab", "x" * 101):
            with self.subTest(title_length=len(title)), self.assertRaises(HTTPException) as invalid:
                self.create_lab(title=title)
            self.assertEqual(invalid.exception.status_code, 400)
            self.assertEqual(invalid.exception.detail, "Vui lòng nhập tên Lab (3–100 ký tự).")

    def test_deadline_must_be_after_opening_time(self):
        with self.assertRaises(HTTPException) as invalid:
            self.create_lab(opens="2026-11-10T23:59:00+07:00", closes="2026-11-10T23:59:00+07:00")
        self.assertEqual(invalid.exception.status_code, 400)
        self.assertEqual(invalid.exception.detail, "Deadline phải sau giờ mở.")

    def test_points_must_be_an_integer_from_one_to_one_hundred(self):
        for points in (0, -1, 1.5, 101, None):
            with self.subTest(points=points), self.assertRaises(HTTPException) as invalid:
                self.create_lab(problems=[{"id": self.problem.id, "points": points}])
            self.assertEqual(invalid.exception.status_code, 400)
            self.assertEqual(invalid.exception.detail, "Điểm phải là số nguyên từ 1 đến 100.")

    def test_nonexistent_question_returns_a_controlled_bad_request(self):
        with self.assertRaises(HTTPException) as invalid:
            self.create_lab(problems=[{"id": "does-not-exist", "points": 10}])
        self.assertEqual(invalid.exception.status_code, 400)
        self.assertEqual(invalid.exception.detail, "Câu hỏi không tồn tại hoặc không khả dụng.")

    def test_invalid_question_update_does_not_change_the_existing_lab(self):
        created = self.create_lab()
        with self.assertRaises(HTTPException) as invalid:
            update_assignment(created["id"], self.payload(
                title="Changed title", problems=[{"id": "does-not-exist", "points": 10}]
            ), self.db, self.teacher)
        self.assertEqual(invalid.exception.status_code, 400)
        stored = self.db.query(Assignment).filter(Assignment.id == created["id"]).one()
        self.assertEqual(stored.title, "Lab 01")
        self.assertEqual(
            [item.problem_id for item in self.db.query(AssignmentProblem).filter_by(assignment_id=stored.id).all()],
            [self.problem.id],
        )

    def test_instructor_cannot_assign_a_lab_to_another_instructors_class(self):
        with self.assertRaises(HTTPException) as invalid:
            self.create_lab(classIds=[self.other_class.id])
        self.assertEqual(invalid.exception.status_code, 400)
        self.assertEqual(invalid.exception.detail, "Lớp không khả dụng.")

    def test_scheduled_lab_question_endpoint_returns_403(self):
        created = self.create_lab()
        stored = self.db.query(Assignment).filter(Assignment.id == created["id"]).one()
        stored.opens = datetime.utcnow() + timedelta(minutes=10)
        stored.closes = datetime.utcnow() + timedelta(days=1)
        self.db.commit()
        with self.assertRaises(HTTPException) as denied:
            get_problem(self.problem.id, stored.id, self.db, self.student_one)
        self.assertEqual(denied.exception.status_code, 403)

    def test_draft_lab_is_not_listed_to_students(self):
        created = self.create_lab(published=False)
        listed = get_student_assignments(self.db, self.student_one)
        self.assertFalse(any(item["id"] == created["id"] for item in listed["assignments"]))

    def test_unpublishing_hides_lab_but_keeps_old_submissions(self):
        created = self.create_lab()
        submission = Submission(
            id=f"lab-submission-{self.suffix}", user_id=self.student_one.id, problem_id=self.problem.id,
            source="Assignments", context=created["id"], result="Accepted", score=10,
        )
        self.db.add(submission)
        self.db.commit()
        update_assignment(created["id"], self.payload(title="Lab 01 revised", published=False), self.db, self.teacher)
        self.assertIsNotNone(self.db.get(Submission, submission.id))
        student_labs = get_student_assignments(self.db, self.student_one)["assignments"]
        self.assertFalse(any(item["id"] == created["id"] for item in student_labs))

    def test_student_cannot_create_lab(self):
        with self.assertRaises(HTTPException) as denied:
            create_assignment(self.payload(), self.db, self.student_one)
        self.assertEqual(denied.exception.status_code, 403)

    def test_assignment_api_requires_authentication(self):
        async def request_without_token():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.post("/api/assignments", json=self.payload().model_dump(by_alias=True, mode="json"))

        response = asyncio.run(request_without_token())
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
