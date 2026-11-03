from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from app.database import get_db
from app.models import User, ActivityLog
from app.routers.auth import get_current_user
from app.security import get_password_hash

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)):
    if getattr(current_user, "role", "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên (Admin) mới có quyền truy cập."
        )
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

class AdminUserCreate(BaseModel):
    name: str
    email: str
    role: str
    password: str

class AdminUserUpdate(BaseModel):
    name: str
    email: str
    role: str
    status: str

class LecturerRequestResponse(BaseModel):
    id: str
    name: str
    email: str
    department: str = ""
    submitted: str

def normalize_role_to_db(role_str: str) -> str:
    r = role_str.strip().lower()
    if r in ("lecturer", "instructor", "teacher"):
        return "instructor"
    elif r == "admin":
        return "admin"
    return "student"

def display_role_from_db(db_role: str) -> str:
    r = (db_role or "").lower()
    if r == "instructor":
        return "Lecturer"
    elif r == "admin":
        return "Admin"
    return "Student"

@router.get("", response_model=List[AdminUserResponse])
def get_admin_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc(), User.id.desc()).all()
    results = []
    for u in users:
        joined_str = u.created_at.strftime("%b %d, %Y") if getattr(u, 'created_at', None) else "Unknown"
        last_active_str = u.last_active.strftime("%b %d, %Y") if getattr(u, 'last_active', None) else "Unknown"
        results.append(AdminUserResponse(
            id=u.id,
            name=u.name,
            email=u.email,
            role=display_role_from_db(u.role),
            status=getattr(u, 'status', 'Active') or 'Active',
            last_active=last_active_str,
            joined=joined_str,
            detail=getattr(u, 'department', '') or ""
        ))
    return results

@router.post("", response_model=AdminUserResponse)
def create_admin_user(
    user_create: AdminUserCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    email = user_create.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email không được để trống.")
        
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail=f"Email '{email}' đã được đăng ký.")

    db_role = normalize_role_to_db(user_create.role)
    name = user_create.name.strip()
    initials = "".join([n[0] for n in name.split() if n])[:2].upper() or "US"

    new_user = User(
        email=email,
        hashed_password=get_password_hash(user_create.password),
        name=name,
        initials=initials,
        role=db_role,
        status="Active",
        created_at=datetime.utcnow(),
        last_active=datetime.utcnow(),
        department=""
    )
    db.add(new_user)
    
    log = ActivityLog(
        user_id=admin_user.id,
        action=f"Created {user_create.role} account for {new_user.email}"
    )
    db.add(log)
    db.commit()
    db.refresh(new_user)

    joined_str = new_user.created_at.strftime("%b %d, %Y")
    last_active_str = new_user.last_active.strftime("%b %d, %Y")

    return AdminUserResponse(
        id=new_user.id,
        name=new_user.name,
        email=new_user.email,
        role=user_create.role,
        status=new_user.status,
        last_active=last_active_str,
        joined=joined_str,
        detail=""
    )

@router.put("/{email}", response_model=AdminUserResponse)
def update_admin_user(
    email: str,
    user_update: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    new_email = user_update.email.strip().lower()
    if new_email != user.email:
        existing = db.query(User).filter(User.email == new_email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email này đã được sử dụng bởi tài khoản khác.")
        user.email = new_email

    user.name = user_update.name.strip()
    user.status = user_update.status
    previous_role = user.role
    user.role = normalize_role_to_db(user_update.role)

    if previous_role != user.role:
        db.add(ActivityLog(user_id=admin_user.id, action=f"Changed role of {user.email} from {previous_role} to {user.role}"))

    db.commit()
    db.refresh(user)

    joined_str = user.created_at.strftime("%b %d, %Y") if getattr(user, 'created_at', None) else "Unknown"
    last_active_str = user.last_active.strftime("%b %d, %Y") if getattr(user, 'last_active', None) else "Unknown"

    return AdminUserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user_update.role,
        status=user.status,
        last_active=last_active_str,
        joined=joined_str,
        detail=getattr(user, 'department', '') or ""
    )

@router.get("/lecturer-requests", response_model=List[LecturerRequestResponse])
def get_lecturer_requests(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).filter(
        User.role == "instructor",
        User.status == "Pending"
    ).all()
    results = []
    for u in users:
        submitted = u.created_at.strftime("%b %d, %Y") if getattr(u, 'created_at', None) else "Unknown"
        results.append(LecturerRequestResponse(
            id=u.id,
            name=u.name,
            email=u.email,
            department=getattr(u, 'department', '') or "",
            submitted=submitted
        ))
    return results

@router.post("/lecturer-requests/{user_id}/approve")
def approve_lecturer_request(user_id: str, db: Session = Depends(get_db), admin_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id, User.status == "Pending").first()
    if not user:
        raise HTTPException(status_code=404, detail="Yêu cầu không tồn tại.")
    user.status = "Active"
    db.add(ActivityLog(user_id=admin_user.id, action=f"Approved lecturer request for {user.email}"))
    db.commit()
    return {"message": "Approved"}

@router.post("/lecturer-requests/{user_id}/reject")
def reject_lecturer_request(user_id: str, db: Session = Depends(get_db), admin_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id, User.status == "Pending").first()
    if not user:
        raise HTTPException(status_code=404, detail="Yêu cầu không tồn tại.")
    db.add(ActivityLog(user_id=admin_user.id, action=f"Rejected lecturer request for {user.email}"))
    db.delete(user)
    db.commit()
    return {"message": "Rejected"}

