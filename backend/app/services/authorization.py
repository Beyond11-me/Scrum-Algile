"""Role and permission checks used by FastAPI routers.

The application currently assigns one primary role to each user.  The helpers
support the new ``role_id`` relationship and fall back to the legacy ``role``
column until every environment has run the RBAC migration.
"""

from collections.abc import Iterable

from fastapi import Depends, HTTPException, status

from app.dependencies.auth import get_current_user
from app.models import User


ROLE_ALIASES = {"lecturer": "instructor"}


def normalize_role_code(role: str | None) -> str | None:
    if role is None:
        return None
    normalized = role.strip().lower()
    return ROLE_ALIASES.get(normalized, normalized)


def get_role_code(user: User) -> str | None:
    role_entity = getattr(user, "role_entity", None)
    if role_entity is not None:
        return normalize_role_code(role_entity.code)
    return normalize_role_code(getattr(user, "role", None))


def has_role(user: User, allowed_roles: Iterable[str]) -> bool:
    role_code = get_role_code(user)
    allowed = {normalize_role_code(role) for role in allowed_roles}
    return role_code is not None and role_code in allowed


def has_permission(user: User, permission_code: str) -> bool:
    role_entity = getattr(user, "role_entity", None)
    if role_entity is not None:
        return any(permission.code == permission_code for permission in role_entity.permissions)

    # A deployment may be rolling out the migration while users with only the
    # legacy text role still exist.  Keep the same least-privilege catalogue
    # during that transition; unknown roles receive no permission.
    from app.services.rbac import ROLE_PERMISSION_CODES

    role_code = get_role_code(user)
    return role_code is not None and permission_code in ROLE_PERMISSION_CODES.get(role_code, set())


def require_roles(*allowed_roles: str):
    """Return a dependency that allows one of the supplied roles."""

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if not has_role(current_user, allowed_roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return current_user

    return dependency


def require_permission(permission_code: str):
    """Return a dependency that requires a seeded RBAC permission."""

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if not has_permission(current_user, permission_code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")
        return current_user

    return dependency
