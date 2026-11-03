"""RBAC catalogue, seeding and legacy-role migration helpers."""

from sqlalchemy.orm import Session

from app.models import Permission, Role, RolePermission, User
from app.services.authorization import normalize_role_code


ROLE_DEFINITIONS = {
    "student": {"name": "Student", "description": "Learns and submits SQL exercises."},
    "instructor": {"name": "Instructor", "description": "Manages assigned classes and learning content."},
    "admin": {"name": "Admin", "description": "Manages users and all system resources."},
}

PERMISSION_DEFINITIONS = {
    "profile.read_self": "Read own profile",
    "problem.read_public": "Read public problems",
    "submission.create_self": "Create own submissions",
    "submission.read_self": "Read own submissions",
    "preferences.manage_self": "Manage own preferences",
    "notification.read_self": "Read own notifications",
    "ai.use": "Use the SQL assistant",
    "class.read_assigned": "Read assigned classes",
    "class.manage_assigned": "Manage assigned classes",
    "problem.manage_owned": "Manage owned problems",
    "assignment.manage_owned": "Manage owned assignments and contests",
    "submission.review_assigned": "Review submissions for assigned activities",
    "user.manage": "Manage users",
    "class.manage_all": "Manage all classes",
    "problem.manage_all": "Manage all problems",
    "assignment.manage_all": "Manage all assignments and contests",
    "submission.review_all": "Review all submissions",
    "system.overview.read": "Read system overview",
}

ROLE_PERMISSION_CODES = {
    "student": {
        "profile.read_self", "problem.read_public", "submission.create_self", "submission.read_self",
        "preferences.manage_self", "notification.read_self", "ai.use",
    },
    "instructor": {
        "class.read_assigned", "class.manage_assigned", "problem.manage_owned",
        "assignment.manage_owned", "submission.review_assigned",
    },
    "admin": set(PERMISSION_DEFINITIONS),
}


def seed_rbac_catalogue(db: Session) -> dict[str, Role]:
    """Create system roles and permissions without committing the transaction."""

    roles: dict[str, Role] = {}
    for code, definition in ROLE_DEFINITIONS.items():
        role = db.query(Role).filter(Role.code == code).one_or_none()
        if role is None:
            role = Role(id=f"role-{code}", code=code, is_system=True, **definition)
            db.add(role)
        roles[code] = role
    db.flush()

    permissions: dict[str, Permission] = {}
    for code, name in PERMISSION_DEFINITIONS.items():
        permission = db.query(Permission).filter(Permission.code == code).one_or_none()
        if permission is None:
            permission = Permission(
                id=f"permission-{code.replace('.', '-')}",
                code=code,
                name=name,
            )
            db.add(permission)
        permissions[code] = permission
    db.flush()

    for role_code, permission_codes in ROLE_PERMISSION_CODES.items():
        for permission_code in permission_codes:
            role_permission = db.get(RolePermission, (roles[role_code].id, permissions[permission_code].id))
            if role_permission is None:
                db.add(RolePermission(role_id=roles[role_code].id, permission_id=permissions[permission_code].id))
    db.flush()
    return roles


def assign_user_role(db: Session, user: User, role_code: str) -> None:
    """Assign a system role while keeping the legacy response field in sync."""

    canonical_code = normalize_role_code(role_code)
    role = db.query(Role).filter(Role.code == canonical_code).one_or_none()
    if role is None:
        raise ValueError(f"RBAC role has not been seeded: {role_code!r}")
    user.role = canonical_code
    user.role_id = role.id


def assign_legacy_user_roles(db: Session, roles: dict[str, Role]) -> int:
    """Populate ``users.role_id`` from the legacy text column.

    Unknown legacy values deliberately fail migration rather than silently
    granting a default role.
    """

    migrated = 0
    for user in db.query(User).filter(User.role_id.is_(None)).all():
        role_code = normalize_role_code(user.role)
        if role_code not in roles:
            raise ValueError(f"User {user.id} has unsupported legacy role: {user.role!r}")
        user.role_id = roles[role_code].id
        migrated += 1
    db.flush()
    return migrated
