"""Create the first RBAC schema and migrate the legacy users.role values.

Run from the backend directory:
    python -m migrations.rbac_v1
"""

from sqlalchemy import Index, inspect, text

from app.database import SessionLocal, engine
from app.models import Permission, Role, RolePermission, User
from app.services.rbac import assign_legacy_user_roles, seed_rbac_catalogue


def ensure_role_id_column() -> None:
    inspector = inspect(engine)
    column_names = {column["name"] for column in inspector.get_columns("users")}
    if "role_id" in column_names:
        return

    column_type = "NVARCHAR(50) NULL" if engine.dialect.name.startswith("mssql") else "VARCHAR(50)"
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE users ADD role_id {column_type}"))


def ensure_role_foreign_key() -> None:
    if not engine.dialect.name.startswith("mssql"):
        return
    inspector = inspect(engine)
    existing = inspector.get_foreign_keys("users")
    if any(foreign_key.get("constrained_columns") == ["role_id"] for foreign_key in existing):
        return
    with engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE users ADD CONSTRAINT fk_users_role_id "
            "FOREIGN KEY (role_id) REFERENCES roles(id)"
        ))


def migrate() -> int:
    # Existing projects created ``users`` before these models existed.  Create
    # only the new tables, then extend users in a separate, idempotent step.
    Role.__table__.create(bind=engine, checkfirst=True)
    Permission.__table__.create(bind=engine, checkfirst=True)
    RolePermission.__table__.create(bind=engine, checkfirst=True)
    ensure_role_id_column()
    ensure_role_foreign_key()
    Index("ix_users_role_id", User.role_id).create(bind=engine, checkfirst=True)

    db = SessionLocal()
    try:
        roles = seed_rbac_catalogue(db)
        migrated = assign_legacy_user_roles(db, roles)
        db.commit()
        return migrated
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    count = migrate()
    print(f"RBAC migration complete. Users assigned a role: {count}")
