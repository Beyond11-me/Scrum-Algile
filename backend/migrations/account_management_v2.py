"""Store an admin-visible copy of each account password.

Run from the backend directory:
    python -m migrations.account_management_v2

Accounts created before this column existed have no readable password. A known
development password is kept when it still matches. Every other such account
gets a new generated password, which the admin user list then shows.
"""

from sqlalchemy import inspect, text

from app.core.security import apply_password, seal_password, verify_password
from app.db.session import SessionLocal, engine
from app.models import User
from app.services.account_policy import generate_password

KNOWN_DEV_PASSWORDS = ("password123", "123")


def add_column() -> int:
    """Add nullable ``users.password_record`` when it is missing."""

    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return 0

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "password_record" in columns:
        return 0
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD password_record NVARCHAR(512) NULL"))
    return 1


def backfill() -> tuple[int, list[str]]:
    """Return how many dev passwords were kept and which emails got a new one."""

    kept = 0
    regenerated: list[str] = []
    db = SessionLocal()
    try:
        for user in db.query(User).filter(User.password_record.is_(None)).all():
            known = next((value for value in KNOWN_DEV_PASSWORDS if verify_password(value, user.hashed_password)), None)
            if known is not None:
                user.password_record = seal_password(known)
                kept += 1
            else:
                apply_password(user, generate_password())
                regenerated.append(user.email)
        db.commit()
    finally:
        db.close()
    return kept, regenerated


def migrate() -> int:
    added = add_column()
    backfill()
    return added


if __name__ == "__main__":
    added = add_column()
    kept, regenerated = backfill()
    print(f"Account management migration v2 complete. Columns added: {added}")
    print(f"Development passwords kept: {kept}")
    print(f"Accounts given a new generated password: {len(regenerated)}")
    for email in regenerated:
        print(f"  {email}")
