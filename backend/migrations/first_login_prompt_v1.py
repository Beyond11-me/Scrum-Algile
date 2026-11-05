"""Add the optional first-login password reminder flag."""

from sqlalchemy import inspect, text
from app.db.session import engine


def migrate() -> int:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return 0
    if "first_login_pending" in {column["name"] for column in inspector.get_columns("users")}:
        return 0
    column_type = "BIT" if engine.dialect.name == "mssql" else "BOOLEAN"
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE users ADD first_login_pending {column_type} NOT NULL DEFAULT 0"))
    return 1
