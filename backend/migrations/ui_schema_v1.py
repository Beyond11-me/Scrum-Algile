"""Add columns required by the current UI without recreating local data.

Run from the backend directory:
    python -m migrations.ui_schema_v1
"""

from sqlalchemy import Index, inspect, text

from app.db.session import engine
from app.models import Problem


def migrate() -> int:
    """Apply the idempotent UI schema upgrade and return added-column count."""

    inspector = inspect(engine)
    if not inspector.has_table("problems"):
        return 0

    columns = {column["name"] for column in inspector.get_columns("problems")}
    added = 0
    if "archived_at" not in columns:
        # SQL Server and SQLite both accept DATETIME NULL for this optional
        # soft-delete timestamp.
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE problems ADD archived_at DATETIME NULL"))
        added += 1

    Index("ix_problems_archived_at", Problem.archived_at).create(bind=engine, checkfirst=True)
    return added


if __name__ == "__main__":
    count = migrate()
    print(f"UI schema migration complete. Columns added: {count}")
