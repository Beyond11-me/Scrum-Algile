"""Regression coverage for instructor-owned SQL question banks."""
import unittest
import uuid

from fastapi import HTTPException
from pydantic import ValidationError

from app.db.session import Base, SessionLocal, engine
from app.models import (
    User, Problem, Submission, TestCase, TestCaseScript, ProblemTopic,
    ProblemDraft, Favorite, ProblemListItem, Assignment, AssignmentProblem,
)
from app.routers.problems import (
    create_problem, delete_problem, get_problem, get_problems,
    restore_problem, update_problem, validate_problem_solution,
)
from app.schemas import ProblemCreate, ProblemValidateRequest


class TestInstructorQuestionBank(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.db = SessionLocal()
        suffix = uuid.uuid4().hex[:12]
        self.teacher_a = User(id=f"qa-{suffix}", email=f"qa-{suffix}@test.invalid", hashed_password="x", name="Teacher A", initials="TA", role="instructor")
        self.teacher_b = User(id=f"qb-{suffix}", email=f"qb-{suffix}@test.invalid", hashed_password="x", name="Teacher B", initials="TB", role="instructor")
        self.student = User(id=f"qs-{suffix}", email=f"qs-{suffix}@test.invalid", hashed_password="x", name="Student", initials="ST", role="student")
        self.db.add_all([self.teacher_a, self.teacher_b, self.student])
        self.user_ids = [self.teacher_a.id, self.teacher_b.id, self.student.id]
        self.db.commit()
        self.problem_ids = []
        self.assignment_ids = []

    def tearDown(self):
        self.db.rollback()
        if self.problem_ids:
            ids = self.problem_ids
            if self.assignment_ids:
                self.db.query(AssignmentProblem).filter(AssignmentProblem.assignment_id.in_(self.assignment_ids)).delete(synchronize_session=False)
                self.db.query(Assignment).filter(Assignment.id.in_(self.assignment_ids)).delete(synchronize_session=False)
            tc_ids = [row[0] for row in self.db.query(TestCase.id).filter(TestCase.problem_id.in_(ids)).all()]
            if tc_ids:
                self.db.query(TestCaseScript).filter(TestCaseScript.test_case_id.in_(tc_ids)).delete(synchronize_session=False)
            self.db.query(TestCase).filter(TestCase.problem_id.in_(ids)).delete(synchronize_session=False)
            self.db.query(ProblemTopic).filter(ProblemTopic.problem_id.in_(ids)).delete(synchronize_session=False)
            self.db.query(Submission).filter(Submission.problem_id.in_(ids)).delete(synchronize_session=False)
            self.db.query(ProblemDraft).filter(ProblemDraft.problem_id.in_(ids)).delete(synchronize_session=False)
            self.db.query(Favorite).filter(Favorite.problem_id.in_(ids)).delete(synchronize_session=False)
            self.db.query(ProblemListItem).filter(ProblemListItem.problem_id.in_(ids)).delete(synchronize_session=False)
            self.db.query(Problem).filter(Problem.id.in_(ids)).delete(synchronize_session=False)
        self.db.query(User).filter(User.id.in_(self.user_ids)).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    @staticmethod
    def payload(**overrides):
        data = {
            "number": "Q-TEST", "title": "Question test", "difficulty": "Easy",
            "visibility": "Public", "topics": "join, Join", "statement": "Return rows",
            "requirements": "", "hints": [], "database": "SQL Server",
            "schema": "CREATE TABLE T (id INT);", "seedData": "INSERT INTO T VALUES (1);",
            "referenceSolution": "SELECT id FROM T;",
            "testCases": [
                {"schema": "CREATE TABLE T (id INT);", "seedData": "INSERT INTO T VALUES (1);", "isHidden": False},
                {"schema": "CREATE TABLE T (id INT);", "seedData": "INSERT INTO T VALUES (2);", "isHidden": True},
            ],
        }
        data.update(overrides)
        return ProblemCreate.model_validate(data)

    def create_owned_problem(self):
        created = create_problem(self.payload(), self.db, self.teacher_a)
        self.problem_ids.append(created.id)
        return created

    def test_instructors_only_see_and_manage_their_own_questions(self):
        created = self.create_owned_problem()
        self.assertIn(created.id, [item.id for item in get_problems(False, self.db, self.teacher_a)])
        self.assertNotIn(created.id, [item.id for item in get_problems(False, self.db, self.teacher_b)])
        with self.assertRaises(HTTPException):
            get_problem(created.id, None, self.db, self.teacher_b)
        with self.assertRaises(HTTPException):
            update_problem(created.id, self.payload(), self.db, self.teacher_b)
        with self.assertRaises(HTTPException):
            delete_problem(created.id, self.db, self.teacher_b)

    def test_required_fields_difficulty_and_test_case_schema_are_validated(self):
        with self.assertRaises(ValidationError):
            self.payload(title="   ")
        with self.assertRaises(ValidationError):
            self.payload(difficulty="Expert")
        with self.assertRaises(ValidationError):
            self.payload(testCases=[])
        with self.assertRaises(ValidationError):
            self.payload(schema="", testCases=[{"schema": "", "seedData": "", "isHidden": False}])

    def test_question_round_trips_multiple_test_cases_and_normalized_topics(self):
        created = self.create_owned_problem()
        details = get_problem(created.id, None, self.db, self.teacher_a)
        self.assertEqual(len(details.test_cases), 2)
        self.assertEqual(details.schema_sql, "CREATE TABLE T (id INT);")
        stored = self.db.query(Problem).filter(Problem.id == created.id).one()
        self.assertEqual(stored.topics, ["JOIN"])
        update_problem(created.id, self.payload(title="Updated"), self.db, self.teacher_a)
        reloaded = get_problem(created.id, None, self.db, self.teacher_a)
        self.assertEqual(reloaded.title, "Updated")
        self.assertEqual(len(reloaded.test_cases), 2)

    def test_archive_preserves_submission_and_restore_returns_question_to_bank(self):
        created = self.create_owned_problem()
        submission = Submission(
            id=f"sub-{uuid.uuid4().hex[:12]}", user_id=self.student.id,
            problem_id=created.id, source="Practice", context="Practice",
            result="Accepted", score=100, query_text="SELECT id FROM T;",
        )
        self.db.add(submission)
        self.db.commit()
        result = delete_problem(created.id, self.db, self.teacher_a)
        self.assertIn("preserved", result["message"])
        self.assertEqual(self.db.query(Submission).filter(Submission.id == submission.id).one().score, 100)
        self.assertNotIn(created.id, [item.id for item in get_problems(False, self.db, self.teacher_a)])
        self.assertIn(created.id, [item.id for item in get_problems(True, self.db, self.teacher_a)])
        restore_problem(created.id, self.db, self.teacher_a)
        self.assertIn(created.id, [item.id for item in get_problems(False, self.db, self.teacher_a)])

    def test_legacy_unowned_question_is_not_exposed_to_any_instructor(self):
        legacy = Problem(
            id=f"legacy-{uuid.uuid4().hex[:12]}", number="OLD", title="Legacy unowned",
            topic="JOIN", topics=["JOIN"], difficulty="Easy", description="Legacy",
            requirements="", practice_listed=False, creator_id=None,
        )
        self.db.add(legacy)
        self.db.commit()
        self.problem_ids.append(legacy.id)
        self.assertNotIn(legacy.id, [item.id for item in get_problems(True, self.db, self.teacher_a)])
        with self.assertRaises(HTTPException):
            get_problem(legacy.id, None, self.db, self.teacher_a)

    def test_invalid_schema_is_reported_as_client_error(self):
        request = ProblemValidateRequest(
            schema="CREATE TABLE [", seedData="", referenceSolution="SELECT 1;",
        )
        with self.assertRaises(HTTPException) as error:
            validate_problem_solution(request, self.db, self.teacher_a)
        self.assertEqual(error.exception.status_code, 400)

    def test_archive_keeps_question_linked_to_existing_assignment(self):
        created = self.create_owned_problem()
        assignment_id = f"asg-{uuid.uuid4().hex[:12]}"
        assignment = Assignment(id=assignment_id, title="Fixture assignment", audience_type="classes", published=True, instructor_id=self.teacher_a.id)
        self.db.add(assignment)
        self.db.flush()
        self.db.add(AssignmentProblem(assignment_id=assignment_id, problem_id=created.id, points=10, order_index=1))
        self.db.commit()
        self.assignment_ids.append(assignment_id)
        delete_problem(created.id, self.db, self.teacher_a)
        linked = self.db.query(AssignmentProblem).filter_by(assignment_id=assignment_id, problem_id=created.id).one_or_none()
        self.assertIsNotNone(linked)


if __name__ == "__main__":
    unittest.main()
