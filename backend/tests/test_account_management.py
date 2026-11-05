"""Account rules for US 1.3, CSV import, and self-service profile changes."""

import asyncio
import os
import sys
import unittest
from unittest.mock import patch

import httpx
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.security import create_access_token, get_password_hash, open_password
from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models import ActivityLog, User
from app.services.account_import import import_accounts, parse_account_csv
from app.services.account_policy import (
    LAST_ADMIN,
    LAST_ADMIN_REMOVE,
    SELF_LOCK,
    SELF_REMOVE,
    assert_account_removal,
    assert_admin_change,
    generate_password,
    name_from_email,
    validate_complex_password,
    validate_person_name,
)
from app.services.rbac import assign_user_role, seed_rbac_catalogue


class TestAccountRules(unittest.TestCase):
    def test_person_name_rejects_accents_digits_and_short_values(self):
        self.assertEqual(validate_person_name("  Nguyen   Van An  "), "Nguyen Van An")
        for value in ("Nguyễn Văn An", "An1", "A", "Nguyen-An", ""):
            with self.assertRaises(ValueError):
                validate_person_name(value)

    def test_csv_name_is_the_mailbox(self):
        self.assertEqual(name_from_email("26520598@gm.uit.edu.vn"), "26520598")
        self.assertEqual(name_from_email("student.name@demo.local"), "student.name")
        with self.assertRaises(ValueError):
            name_from_email("a@demo.local")

    def test_generated_password_is_not_a_simple_word(self):
        for _ in range(20):
            password = generate_password()
            self.assertEqual(len(password), 12)
            validate_complex_password(password)
            self.assertNotIn("password", password.lower())

    def test_admin_cannot_remove_the_last_active_admin_or_themselves(self):
        with self.assertRaisesRegex(ValueError, SELF_LOCK):
            assert_admin_change(
                actor_email="admin@demo.local",
                target_email="admin@demo.local",
                target_is_active_admin=True,
                other_active_admins=2,
                new_role="admin",
                new_status="Inactive",
            )
        with self.assertRaisesRegex(ValueError, LAST_ADMIN):
            assert_admin_change(
                actor_email="owner@demo.local",
                target_email="admin@demo.local",
                target_is_active_admin=True,
                other_active_admins=0,
                new_role="student",
                new_status="Active",
            )
        with self.assertRaisesRegex(ValueError, SELF_REMOVE):
            assert_account_removal(
                actor_email="admin@demo.local",
                target_email="admin@demo.local",
                target_is_active_admin=True,
                other_active_admins=3,
            )
        with self.assertRaisesRegex(ValueError, LAST_ADMIN_REMOVE):
            assert_account_removal(
                actor_email="owner@demo.local",
                target_email="admin@demo.local",
                target_is_active_admin=True,
                other_active_admins=0,
            )


class TestAccountCsv(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        seed_rbac_catalogue(self.db)
        self.admin = User(
            id="csv-admin",
            email="csv-admin@demo.local",
            name="Csv Admin",
            initials="CA",
            hashed_password="hash",
            role="admin",
            status="Active",
        )
        self.db.add(self.admin)
        assign_user_role(self.db, self.admin, "admin")
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_import_uses_mailbox_names_and_generated_passwords(self):
        raw = (
            "email,role\n"
            "26520598@gm.uit.edu.vn,Student\n"
            "26520598@GM.UIT.EDU.VN,Student\n"
            "bad-email,Lecturer\n"
            "a@demo.local,Student\n"
            "teacher.one@demo.local,Lecturer\n"
        ).encode()
        self.assertEqual(len(parse_account_csv(raw)), 5)
        result = import_accounts(self.db, self.admin, raw)
        self.assertEqual(result.created, 2)
        self.assertEqual(result.duplicates, 1)
        self.assertEqual(result.invalid, 2)
        created = self.db.query(User).filter(User.email == "26520598@gm.uit.edu.vn").one()
        self.assertEqual(created.name, "26520598")
        self.assertEqual(created.role, "student")
        recorded = [line.split(",")[4] for line in result.report_csv.splitlines() if line.startswith("26520598@gm.uit.edu.vn")][0]
        self.assertEqual(open_password(created.password_record), recorded)
        self.assertIn(",created,", result.report_csv)
        self.assertNotIn("password", (self.db.query(ActivityLog).one().action).lower())
        lecturer = self.db.query(User).filter(User.email == "teacher.one@demo.local").one()
        self.assertEqual(lecturer.name, "teacher.one")
        self.assertEqual(lecturer.role, "instructor")


class TestAccountApi(unittest.TestCase):
    prefix = "acct-us13"

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.db = SessionLocal()
        self.sent_passwords = {}
        for target, replacement in (
            ("app.routers.admin_users.smtp_configured", lambda: True),
            ("app.routers.admin_users.send_initial_password", lambda email, password: self.sent_passwords.update({email: password})),
            ("app.services.account_import.send_initial_password", lambda email, password: self.sent_passwords.update({email: password})),
        ):
            patcher = patch(target, side_effect=replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        seed_rbac_catalogue(self.db)
        self.db.commit()
        self.created_emails = []
        admin = self.db.query(User).filter(func.lower(User.role) == "admin", func.lower(User.status) == "active").first()
        if admin is None:
            admin = self._add_user("api-admin@example.com", "Api Admin", "admin", "Active", "AdminPass1!")
        self.admin_email = admin.email
        self.admin_token = create_access_token({"sub": admin.email})

    def tearDown(self):
        if self.created_emails:
            ids = [row[0] for row in self.db.query(User.id).filter(User.email.in_(self.created_emails)).all()]
            if ids:
                self.db.query(ActivityLog).filter(ActivityLog.user_id.in_(ids)).delete(synchronize_session=False)
            self.db.query(User).filter(User.email.in_(self.created_emails)).delete(synchronize_session=False)
            self.db.commit()
        self.db.close()

    def _add_user(self, email, name, role, status, password):
        user = User(
            id=email,
            email=email,
            name=name,
            initials="TU",
            hashed_password=get_password_hash(password),
            role=role,
            status=status,
        )
        self.db.add(user)
        assign_user_role(self.db, user, role)
        self.db.commit()
        self.created_emails.append(email)
        return user

    @staticmethod
    def request(method, path, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_create_validation_permissions_and_hidden_password(self):
        open_call = self.request("POST", "/api/admin/users", json={"name": "Nguyen Van An", "email": "open@example.com", "role": "Student", "password": "password123"})
        self.assertEqual(open_call.status_code, 401)

        student = self._add_user(f"{self.prefix}-student@example.com", "Student User", "student", "Active", "password123")
        student_token = create_access_token({"sub": student.email})
        forbidden = self.request("GET", "/api/admin/users", headers=self.auth(student_token))
        self.assertEqual(forbidden.status_code, 403)

        missing = self.request("POST", "/api/admin/users", headers=self.auth(self.admin_token), json={"role": "Student"})
        self.assertEqual(missing.status_code, 400)
        self.assertIn("name", missing.json()["detail"])

        accented = self.request(
            "POST", "/api/admin/users", headers=self.auth(self.admin_token),
            json={"name": "Nguyễn Văn An", "email": f"{self.prefix}-accent@example.com", "role": "Student", "password": "password123"},
        )
        self.assertEqual(accented.status_code, 400)

        short = self.request(
            "POST", "/api/admin/users", headers=self.auth(self.admin_token),
            json={"name": "Short Pass", "email": f"{self.prefix}-short@example.com", "role": "Admin", "password": "1234567"},
        )
        self.assertEqual(short.status_code, 400)

        bad_email = self.request(
            "POST", "/api/admin/users", headers=self.auth(self.admin_token),
            json={"name": "Bad Email", "email": "abc", "role": "Student", "password": "password123"},
        )
        self.assertEqual(bad_email.status_code, 400)

        email = f"{self.prefix}-new@example.com"
        created = self.request(
            "POST", "/api/admin/users", headers=self.auth(self.admin_token),
            json={"name": "New Student", "email": email, "role": "Student", "password": "password123"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        body = created.json()
        self.assertEqual(body["password"], self.sent_passwords[email])
        self.assertEqual(body["emailDelivery"], "sent")
        self.assertTrue(self.db.query(User).filter(User.email == email).one().first_login_pending)
        self.assertNotIn("hashed_password", body)
        self.assertEqual(body["status"], "Active")
        self.created_emails.append(email.lower())

        duplicate = self.request(
            "POST", "/api/admin/users", headers=self.auth(self.admin_token),
            json={"name": "New Student", "email": email.upper(), "role": "Student", "password": "password123"},
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn(email, duplicate.json()["detail"]["email"])

        strange_role = self.request(
            "POST", "/api/admin/users", headers=self.auth(self.admin_token),
            json={"name": "Strange Role", "email": f"{self.prefix}-role@example.com", "role": "Owner", "password": "password123"},
        )
        self.assertEqual(strange_role.status_code, 400)

    def test_legacy_accented_name_can_change_status_and_inactive_login_is_blocked(self):
        email = f"{self.prefix}-legacy@example.com"
        self._add_user(email, "Nguyễn Văn An", "student", "Active", "password123")
        updated = self.request(
            "PUT", f"/api/admin/users/{email}", headers=self.auth(self.admin_token),
            json={"name": "Nguyễn Văn An", "email": email, "role": "Student", "status": "Inactive"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], "Nguyễn Văn An")
        self.assertEqual(updated.json()["status"], "Inactive")

        login = self.request("POST", "/api/auth/login", json={"email": email, "password": "password123"})
        self.assertEqual(login.status_code, 403)
        self.assertEqual(login.json()["detail"], "Tài khoản của bạn đã bị vô hiệu hóa.")

        token = create_access_token({"sub": email})
        blocked = self.request("GET", "/api/auth/me", headers=self.auth(token))
        self.assertEqual(blocked.status_code, 403)

    def test_admin_cannot_deactivate_self_and_can_reset_a_password(self):
        blocked = self.request(
            "PUT", f"/api/admin/users/{self.admin_email}", headers=self.auth(self.admin_token),
            json={"name": "Admin User", "email": self.admin_email, "role": "Admin", "status": "Inactive"},
        )
        self.assertEqual(blocked.status_code, 400)

        email = f"{self.prefix}-reset@example.com"
        self._add_user(email, "Reset User", "student", "Active", "password123")
        reset = self.request(
            "POST", f"/api/admin/users/{email}/reset-password", headers=self.auth(self.admin_token),
            json={"password": "newpassword"},
        )
        self.assertEqual(reset.status_code, 200, reset.text)
        self.assertNotIn("password", reset.json())
        old_login = self.request("POST", "/api/auth/login", json={"email": email, "password": "password123"})
        self.assertEqual(old_login.status_code, 400)
        new_login = self.request("POST", "/api/auth/login", json={"email": email, "password": "newpassword"})
        self.assertEqual(new_login.status_code, 200)
        self.assertNotIn("newpassword", str(self.db.query(ActivityLog).filter(ActivityLog.action.contains(email)).all()))
        listed = self.request("GET", "/api/admin/users", headers=self.auth(self.admin_token))
        visible = next(item for item in listed.json() if item["email"] == email)
        self.assertEqual(visible["password"], "newpassword")
        me = self.request("GET", "/api/auth/me", headers=self.auth(self.admin_token))
        self.assertNotIn("password", me.json())

        hidden = f"{self.prefix}-hidden@example.com"
        self._add_user(hidden, "Hidden Pass", "student", "Active", "password123")
        before = self.request("GET", "/api/admin/users", headers=self.auth(self.admin_token))
        self.assertEqual(next(item for item in before.json() if item["email"] == hidden)["password"], "")
        signed_in = self.request("POST", "/api/auth/login", json={"email": hidden, "password": "password123"})
        self.assertEqual(signed_in.status_code, 200, signed_in.text)
        after = self.request("GET", "/api/admin/users", headers=self.auth(self.admin_token))
        self.assertEqual(next(item for item in after.json() if item["email"] == hidden)["password"], "password123")

    def test_remove_account_requires_the_exact_email_and_keeps_the_acting_admin(self):
        refused = self.request(
            "DELETE", f"/api/admin/users/{self.admin_email}", headers=self.auth(self.admin_token),
            json={"confirmEmail": self.admin_email},
        )
        self.assertEqual(refused.status_code, 400)

        email = f"{self.prefix}-remove@example.com"
        self._add_user(email, "Remove User", "student", "Active", "password123")
        mismatch = self.request(
            "DELETE", f"/api/admin/users/{email}", headers=self.auth(self.admin_token),
            json={"confirmEmail": "someone-else@example.com"},
        )
        self.assertEqual(mismatch.status_code, 400)
        self.assertTrue(self.db.query(User).filter(User.email == email).first())

        removed = self.request(
            "DELETE", f"/api/admin/users/{email}", headers=self.auth(self.admin_token),
            json={"confirmEmail": email},
        )
        self.assertEqual(removed.status_code, 200, removed.text)
        self.db.expire_all()
        self.assertIsNone(self.db.query(User).filter(User.email == email).first())
        login = self.request("POST", "/api/auth/login", json={"email": email, "password": "password123"})
        self.assertEqual(login.status_code, 400)
        self.created_emails.remove(email)

    def test_csv_import_and_profile_cooldown(self):
        email = f"{self.prefix}-26520598@example.com"
        raw = f"email,role\n{email},Student\n".encode()
        imported = self.request(
            "POST", "/api/admin/users/import", headers=self.auth(self.admin_token),
            files={"file": ("accounts.csv", raw, "text/csv")},
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        payload = imported.json()
        self.assertEqual(payload["created"], 1)
        self.created_emails.append(email)
        self.assertIn("26520598", payload["reportCsv"])
        stored = self.db.query(User).filter(User.email == email).one()
        self.assertEqual(stored.name, f"{self.prefix}-26520598")
        password = self.sent_passwords[email]
        self.assertIn("Credentials emailed", payload["reportCsv"])
        login = self.request("POST", "/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertTrue(login.json()["user"]["first_login_pending"])
        token = login.json()["access_token"]

        dismissed = self.request("POST", "/api/auth/first-login/dismiss", headers=self.auth(token))
        self.assertEqual(dismissed.status_code, 200, dismissed.text)
        self.assertFalse(dismissed.json()["first_login_pending"])

        renamed = self.request(
            "PATCH", "/api/auth/profile", headers=self.auth(token),
            json={"name": "Imported Student"},
        )
        self.assertEqual(renamed.status_code, 200, renamed.text)
        again = self.request(
            "PATCH", "/api/auth/profile", headers=self.auth(token),
            json={"name": "Imported Student Two"},
        )
        self.assertEqual(again.status_code, 400)
        self.assertIn("again on", again.json()["detail"])

        weak = self._add_user(f"{self.prefix}-weak@example.com", "Weak User", "student", "Active", "password123")
        weak_token = create_access_token({"sub": weak.email})
        rejected = self.request(
            "PATCH", "/api/auth/profile", headers=self.auth(weak_token),
            json={"currentPassword": "password123", "newPassword": "password123"},
        )
        self.assertEqual(rejected.status_code, 400)


if __name__ == "__main__":
    unittest.main()
