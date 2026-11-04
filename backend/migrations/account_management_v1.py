"""Add the profile-change timestamp and retire Pending accounts.

Run from the backend directory:
    python -m migrations.account_management_v1
"""

from sqlalchemy import inspect, text

from app.db.session import engine


def migrate() -> int:
    """Add ``users.profile_updated_at`` and set Pending accounts to Inactive."""

    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return 0

    columns = {column["name"] for column in inspector.get_columns("users")}
    added = 0
    with engine.begin() as connection:
        if "profile_updated_at" not in columns:
            connection.execute(text("ALTER TABLE users ADD profile_updated_at DATETIME NULL"))
            added += 1
        connection.execute(text("UPDATE users SET status = 'Inactive' WHERE LOWER(status) = 'pending'"))
    return added


if __name__ == "__main__":
    count = migrate()
    print(f"Account management migration complete. Columns added: {count}")
