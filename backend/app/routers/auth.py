from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from pydantic import BaseModel, ConfigDict, Field
from app.models import User
from app.schemas import LoginRequest, UserResponse, TokenWithUser
from app.core.security import apply_password, create_access_token, store_known_password, verify_password
from app.services.account_policy import (
    CURRENT_PASSWORD,
    NOTHING_TO_CHANGE,
    cooldown_message,
    initials_for,
    normalize_person_name,
    profile_locked_until,
    validate_complex_password,
    validate_person_name,
)

router = APIRouter()


def require_active_account(user: User) -> None:
    """Only active accounts may receive a new access token."""

    if (getattr(user, "status", "Active") or "Active").lower() == "active":
        return
    if (user.status or "").lower() == "pending":
        detail = "Tài khoản đang chờ Quản trị viên phê duyệt."
    else:
        detail = "Tài khoản của bạn đã bị vô hiệu hóa."
    raise HTTPException(status_code=403, detail=detail)

@router.post("/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    require_active_account(user)
    if store_known_password(user, form_data.password):
        db.commit()
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

class ProfileUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    current_password: str | None = Field(default=None, alias="currentPassword")
    new_password: str | None = Field(default=None, alias="newPassword")


class ProfileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    email: str
    initials: str
    role: str
    next_profile_change_at: str | None = Field(default=None, alias="nextProfileChangeAt")


def _profile_response(user: User) -> ProfileResponse:
    locked = profile_locked_until(getattr(user, "profile_updated_at", None))
    return ProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        initials=user.initials,
        role=user.role,
        next_profile_change_at=locked.strftime("%Y-%m-%dT%H:%M:%SZ") if locked else None,
    )


@router.get("/profile", response_model=ProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return _profile_response(current_user)


@router.patch("/profile", response_model=ProfileResponse)
def update_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    password_changed = bool(body.new_password)
    name_changed = body.name is not None and normalize_person_name(body.name) != normalize_person_name(current_user.name)
    if not name_changed and not password_changed:
        raise HTTPException(status_code=400, detail=NOTHING_TO_CHANGE)

    locked = profile_locked_until(getattr(current_user, "profile_updated_at", None))
    if locked is not None:
        raise HTTPException(status_code=400, detail=cooldown_message(locked))

    next_name = current_user.name
    if name_changed:
        try:
            next_name = validate_person_name(body.name or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"name": str(exc)})

    if password_changed:
        if not body.current_password or not verify_password(body.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail={"currentPassword": CURRENT_PASSWORD})
        try:
            next_password = validate_complex_password(body.new_password or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"newPassword": str(exc)})
        apply_password(current_user, next_password)

    if name_changed:
        current_user.name = next_name
        current_user.initials = initials_for(next_name)
    current_user.profile_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return _profile_response(current_user)


@router.post("/login", response_model=TokenWithUser)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    require_active_account(user)
    if store_known_password(user, login_data.password):
        db.commit()
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}

@router.post("/demo", response_model=TokenWithUser)
def demo_login(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "student@demo.local").first()
    if not user:
        raise HTTPException(status_code=400, detail="Demo account not found")
        
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
