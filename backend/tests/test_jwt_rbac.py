"""End-to-end checks for the JWT middleware and class-management RBAC guard."""

import asyncio
import unittest

import httpx

from app.core.security import create_access_token
from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models import Class, User
from app.services.rbac import assign_user_role, seed_rbac_catalogue


class TestJwtMiddlewareAndRbac(unittest.TestCase):
    student_email = "jwt-rbac-student@isql.local"
    instructor_email = "jwt-rbac-instructor@isql.local"
    class_id = "JWT_RBAC_CLASS"

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.db = SessionLocal()
        seed_rbac_catalogue(self.db)
        self.db.query(Class).filter(Class.id == self.class_id).delete()
        self.db.query(User).filter(User.email.in_([self.student_email, self.instructor_email])).delete()

        student = User(
            id="jwt-rbac-student",
            email=self.student_email,
            name="JWT RBAC Student",
            initials="JS",
            hashed_password="not-used-by-this-test",
            role="student",
            status="Active",
        )
        instructor = User(
            id="jwt-rbac-instructor",
            email=self.instructor_email,
            name="JWT RBAC Instructor",
            initials="JI",
            hashed_password="not-used-by-this-test",
            role="instructor",
            status="Active",
        )
        self.db.add_all([student, instructor])
        assign_user_role(self.db, student, "student")
        assign_user_role(self.db, instructor, "instructor")
        self.db.commit()

        self.student_token = create_access_token({"sub": self.student_email})
        self.instructor_token = create_access_token({"sub": self.instructor_email})

    def tearDown(self):
        self.db.query(Class).filter(Class.id == self.class_id).delete()
        self.db.query(User).filter(User.email.in_([self.student_email, self.instructor_email])).delete()
        self.db.commit()
        self.db.close()

    @staticmethod
    def request(method: str, path: str, **kwargs) -> httpx.Response:
        async def send() -> httpx.Response:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    def test_protected_api_requires_bearer_token(self):
        response = self.request("GET", "/api/teacher/classes")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def test_protected_api_rejects_invalid_bearer_token(self):
        response = self.request(
            "GET",
            "/api/teacher/classes",
            headers={"Authorization": "Bearer not-a-jwt"},
        )
        self.assertEqual(response.status_code, 401)

    def test_student_cannot_create_instructor_class(self):
        response = self.request(
            "POST",
            "/api/teacher/classes",
            headers={"Authorization": f"Bearer {self.student_token}"},
            json={"id": self.class_id, "course": "RBAC", "term": "HK1"},
        )
        self.assertEqual(response.status_code, 403)

    def test_instructor_can_create_class_with_valid_token(self):
        response = self.request(
            "POST",
            "/api/teacher/classes",
            headers={"Authorization": f"Bearer {self.instructor_token}"},
            json={"id": self.class_id, "course": "RBAC", "term": "HK1"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], self.class_id)


if __name__ == "__main__":
    unittest.main()
