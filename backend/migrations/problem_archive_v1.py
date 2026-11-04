"""Add soft-archive support to problems without changing submissions."""
from sqlalchemy import inspect, text
from app.db.session import engine


def migrate() -> None:
    inspector = inspect(engine)
    if "problems" not in inspector.get_table_names():
        raise RuntimeError("The problems table must exist before this migration.")
    if "archived_at" not in {column["name"] for column in inspector.get_columns("problems")}:
        column_type = "DATETIME2 NULL" if engine.dialect.name == "mssql" else "DATETIME NULL"
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE problems ADD archived_at {column_type}"))


if __name__ == "__main__":
    migrate()
    print("Problem archive migration completed.")
