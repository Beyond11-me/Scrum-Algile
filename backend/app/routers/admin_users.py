from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import apply_password, open_password
from app.db.session import get_db
from app.models import ActivityLog, User
from app.services.account_import import AccountImportResult, import_accounts
from app.services.account_policy import (
    CONFIRM_MISMATCH,
    assert_account_removal,
    assert_admin_change,
    canonical_role,
    canonical_status,
    display_role,
    email_taken_message,
    generate_password,
    initials_for,
    normalize_email,
    normalize_person_name,
    validate_admin_password,
    validate_person_name,
)
from app.services.account_removal import purge_account
from app.services.authorization import require_permission
from app.services.rbac import assign_user_role

router = APIRouter()


def require_admin(current_user: User = Depends(require_permission("user.manage"))):
    return current_user


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: Optional[str] = None
    name: str
    email: str
    role: str
    status: str
    last_active: str = Field(alias="lastActive")
    joined: str
    detail: str = ""
    password: str = ""


class AdminUserCreate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


class ResetPasswordBody(BaseModel):
    password: Optional[str] = None
    generate: bool = False


class DeleteAccountBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    confirm_email: str = Field(alias="confirmEmail")


class AccountImportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    created: int
    duplicates: int
    invalid: int
    report_csv: str = Field(alias="reportCsv")


def _fields(error: ValueError, field: str) -> HTTPException:
    return HTTPException(status_code=400, detail={field: str(error)})


def _user_response(user: User) -> AdminUserResponse:
    joined = user.created_at.strftime("%b %d, %Y") if getattr(user, "created_at", None) else "Unknown"
    last_active = user.last_active.strftime("%b %d, %Y") if getattr(user, "last_active", None) else "Unknown"
    return AdminUserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=display_role(user.role),
        status=user.status or "Active",
        last_active=last_active,
        joined=joined,
        detail="",
        password=open_password(getattr(user, "password_record", None)) or "",
    )


def _find_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == email).first()


def _checked_name(value: str | None, *, previous: str | None = None) -> str:
    if value is None or not str(value).strip():
        raise ValueError("Name is required.")
    normalized = normalize_person_name(value)
    if previous is not None and normalized == normalize_person_name(previous):
        return previous
    return validate_person_name(value)


def _checked_email(value: str | None) -> str:
    if value is None or not str(value).strip():
        raise ValueError("Email is required.")
    return normalize_email(value)


@router.get("", response_model=List[AdminUserResponse])
def get_admin_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc(), User.id.desc()).all()
    return [_user_response(user) for user in users]


@router.post("", response_model=AdminUserResponse)
def create_admin_user(
    user_create: AdminUserCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    problems: dict[str, str] = {}
    try:
        name = _checked_name(user_create.name)
    except ValueError as exc:
        problems["name"] = str(exc)
        name = ""
    try:
        email = _checked_email(user_create.email)
    except ValueError as exc:
        problems["email"] = str(exc)
        email = ""
    try:
        role = canonical_role(user_create.role or "")
    except ValueError as exc:
        problems["role"] = str(exc)
        role = ""
    try:
        password = validate_admin_password(user_create.password or "")
    except ValueError as exc:
        problems["password"] = str(exc)
        password = ""
    if problems:
        raise HTTPException(status_code=400, detail=problems)
    if _find_email(db, email):
        raise HTTPException(status_code=400, detail={"email": email_taken_message(email)})

    new_user = User(
        email=email,
        name=name,
        initials=initials_for(name),
        status="Active",
        created_at=datetime.utcnow(),
        last_active=datetime.utcnow(),
    )
    apply_password(new_user, password)
    db.add(new_user)
    assign_user_role(db, new_user, role)
    db.add(ActivityLog(user_id=admin_user.id, action=f"Created {display_role(role)} account for {email}"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail={"email": email_taken_message(email)})
    db.refresh(new_user)
    return _user_response(new_user)


@router.post("/import", response_model=AccountImportResponse)
async def import_admin_users(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    raw = await file.read()
    if len(raw) > 1_000_000:
        raise HTTPException(status_code=400, detail="The CSV file is too large.")
    try:
        result: AccountImportResult = import_accounts(db, admin_user, raw)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    return AccountImportResponse(
        created=result.created,
        duplicates=result.duplicates,
        invalid=result.invalid,
        report_csv=result.report_csv,
    )


@router.post("/{email}/reset-password")
def reset_password(
    email: str,
    body: ResetPasswordBody,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    try:
        target_email = normalize_email(email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"email": str(exc)})
    user = _find_email(db, target_email)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    generated = None
    if body.generate:
        generated = generate_password()
        password = generated
    else:
        try:
            password = validate_admin_password(body.password or "")
        except ValueError as exc:
            raise _fields(exc, "password")

    apply_password(user, password)
    db.add(ActivityLog(user_id=admin_user.id, action=f"Admin {admin_user.email} reset password for {user.email}"))
    db.commit()
    if generated:
        return {"password": generated}
    return {"message": "Password reset."}


@router.put("/{email}", response_model=AdminUserResponse)
def update_admin_user(
    email: str,
    user_update: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    try:
        current_email = normalize_email(email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"email": str(exc)})
    user = _find_email(db, current_email)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    problems: dict[str, str] = {}
    try:
        name = _checked_name(user_update.name, previous=user.name)
    except ValueError as exc:
        problems["name"] = str(exc)
        name = user.name
    try:
        new_email = _checked_email(user_update.email)
    except ValueError as exc:
        problems["email"] = str(exc)
        new_email = user.email
    try:
        role = canonical_role(user_update.role or "")
    except ValueError as exc:
        problems["role"] = str(exc)
        role = user.role
    try:
        status = canonical_status(user_update.status or "")
    except ValueError as exc:
        problems["status"] = str(exc)
        status = user.status
    if problems:
        raise HTTPException(status_code=400, detail=problems)

    if new_email != (user.email or "").lower() and _find_email(db, new_email):
        raise HTTPException(status_code=400, detail={"email": email_taken_message(new_email)})

    other_admins = db.query(User).filter(
        User.id != user.id,
        func.lower(User.role) == "admin",
        func.lower(User.status) == "active",
    ).count()
    try:
        assert_admin_change(
            actor_email=admin_user.email,
            target_email=user.email,
            target_is_active_admin=(user.role or "").lower() == "admin" and (user.status or "").lower() == "active",
            other_active_admins=other_admins,
            new_role=role,
            new_status=status,
        )
    except ValueError as exc:
        field = "role" if status == "Active" else "status"
        raise HTTPException(status_code=400, detail={field: str(exc)})

    previous_role = user.role
    previous_status = user.status
    user.name = name
    user.initials = initials_for(name)
    user.email = new_email
    user.status = status
    assign_user_role(db, user, role)
    if previous_role != user.role:
        db.add(ActivityLog(user_id=admin_user.id, action=f"Changed role of {user.email} from {previous_role} to {user.role}"))
    if (previous_status or "") != status:
        db.add(ActivityLog(user_id=admin_user.id, action=f"Changed status of {user.email} from {previous_status} to {status}"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail={"email": email_taken_message(new_email)})
    db.refresh(user)
    return _user_response(user)


@router.delete("/{email}")
def delete_admin_user(
    email: str,
    body: DeleteAccountBody,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    try:
        current_email = normalize_email(email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"email": str(exc)})
    user = _find_email(db, current_email)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if body.confirm_email.strip() != user.email:
        raise HTTPException(status_code=400, detail=CONFIRM_MISMATCH)

    other_admins = db.query(User).filter(
        User.id != user.id,
        func.lower(User.role) == "admin",
        func.lower(User.status) == "active",
    ).count()
    try:
        assert_account_removal(
            actor_email=admin_user.email,
            target_email=user.email,
            target_is_active_admin=(user.role or "").lower() == "admin" and (user.status or "").lower() == "active",
            other_active_admins=other_admins,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        purge_account(db, admin_user, user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="This account is still linked to other records and could not be removed.")
    return {"message": "Account removed."}
