from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models import User
from app.schemas import LoginRequest, UserResponse, TokenWithUser
from app.core.security import verify_password, create_access_token

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
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login", response_model=TokenWithUser)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    require_active_account(user)
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
