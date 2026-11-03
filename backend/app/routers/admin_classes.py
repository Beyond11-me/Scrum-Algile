from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from app.database import get_db
from app.models import User, Class, ClassEnrollment, ActivityLog
from app.routers.auth import get_current_user

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)):
    if getattr(current_user, "role", "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên (Admin) mới có quyền truy cập."
        )
    return current_user

class ClassCreatePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str
    course: str
    semester: Optional[str] = None
    term: Optional[str] = None
    lecturer_id: Optional[str] = Field(default=None, alias="lecturerId")
    instructor_id: Optional[str] = None
    start_date: Optional[str] = Field(default=None, alias="startDate")
    end_date: Optional[str] = Field(default=None, alias="endDate")

class ClassUpdatePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    course: Optional[str] = None
    semester: Optional[str] = None
    term: Optional[str] = None
    dates: Optional[str] = None
    lecturer_id: Optional[str] = Field(default=None, alias="lecturerId")
    instructor_id: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = Field(default=None, alias="startDate")
    end_date: Optional[str] = Field(default=None, alias="endDate")

class ClassResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    course: str
    semester: str
    term: str
    lecturer: str
    lecturer_id: Optional[str] = Field(default=None, serialization_alias="lecturerId")
    instructor_id: Optional[str] = None
    instructor_name: Optional[str] = None
    students: int = 0
    status: str = "Active"
    dates: str = "Sep 07 – Nov 28, 2026"
    start_date: Optional[str] = Field(default=None, serialization_alias="startDate")
    end_date: Optional[str] = Field(default=None, serialization_alias="endDate")

class LecturerOption(BaseModel):
    id: str
    name: str
    email: str

def format_class_response(c: Class, db: Session) -> ClassResponse:
    instructor = db.query(User).filter(User.id == c.instructor_id).first() if c.instructor_id else None
    lecturer_name = instructor.name if instructor else "Unassigned"
    student_count = db.query(ClassEnrollment).filter(ClassEnrollment.class_id == c.id).count()
    term_val = c.term or "HK1 2026"
    return ClassResponse(
        id=c.id,
        course=c.course,
        semester=term_val,
        term=term_val,
        lecturer=lecturer_name,
        lecturer_id=c.instructor_id,
        instructor_id=c.instructor_id,
        instructor_name=lecturer_name,
        students=student_count,
        status=c.status or "Active",
        dates=f"{c.start_date} – {c.end_date}" if c.start_date and c.end_date else "Sep 07 – Nov 28, 2026",
        start_date=c.start_date,
        end_date=c.end_date
    )

@router.get("", response_model=List[ClassResponse])
def get_admin_classes(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    classes = db.query(Class).order_by(Class.created_at.desc(), Class.id.desc()).all()
    return [format_class_response(c, db) for c in classes]

@router.get("/lecturers", response_model=List[LecturerOption])
def get_lecturers_for_class(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    lecturers = db.query(User).filter(User.role == "instructor").all()
    return [LecturerOption(id=u.id, name=u.name, email=u.email) for u in lecturers]

@router.post("", response_model=ClassResponse)
def create_class(req: ClassCreatePayload, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    class_id = req.id.strip()
    if not class_id:
        raise HTTPException(status_code=400, detail="Mã lớp không được để trống.")
        
    existing = db.query(Class).filter(Class.id == class_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Mã lớp '{class_id}' đã tồn tại.")

    # Determine term / semester
    term = (req.semester or req.term or "").strip()
    if not term:
        term = "HK1 2026"

    # Determine instructor ID
    target_instructor = req.lecturer_id or req.instructor_id
    assigned_instructor_id = None
    if target_instructor and target_instructor.strip() and target_instructor != "Unassigned":
        inst = db.query(User).filter(User.id == target_instructor.strip(), User.role == "instructor").first()
        if inst:
            assigned_instructor_id = inst.id

    new_class = Class(
        id=class_id,
        course=req.course.strip(),
        term=term,
        instructor_id=assigned_instructor_id,
        start_date=req.start_date,
        end_date=req.end_date,
        status="Active",
        created_at=datetime.utcnow()
    )
    db.add(new_class)
    
    # Activity log
    log = ActivityLog(
        user_id=current_user.id,
        action=f"Created class {new_class.id}"
    )
    db.add(log)
    db.commit()
    db.refresh(new_class)
    
    return format_class_response(new_class, db)

@router.put("/{class_id}", response_model=ClassResponse)
def update_class(
    class_id: str,
    req: ClassUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    c = db.query(Class).filter(Class.id == class_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Lớp học không tồn tại.")

    if req.course is not None:
        c.course = req.course.strip()
    if req.semester is not None:
        c.term = req.semester.strip()
    elif req.term is not None:
        c.term = req.term.strip()
    if req.status is not None:
        c.status = req.status
    if req.start_date is not None:
        c.start_date = req.start_date
    if req.end_date is not None:
        c.end_date = req.end_date

    target_instructor = req.lecturer_id if req.lecturer_id is not None else req.instructor_id
    if target_instructor is not None:
        if target_instructor == "Unassigned" or not target_instructor.strip():
            c.instructor_id = None
        else:
            instructor = db.query(User).filter(User.id == target_instructor.strip(), User.role == "instructor").first()
            if instructor:
                c.instructor_id = instructor.id
            else:
                raise HTTPException(status_code=400, detail="Giảng viên không tồn tại hoặc không hợp lệ.")

    log = ActivityLog(
        user_id=current_user.id,
        action=f"Updated class {c.id}"
    )
    db.add(log)
    db.commit()
    db.refresh(c)
    
    return format_class_response(c, db)

@router.delete("/{class_id}")
def delete_class(class_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    target = db.query(Class).filter(Class.id == class_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học.")
    
    db.delete(target)
    log = ActivityLog(
        user_id=current_user.id,
        action=f"Deleted class {class_id}"
    )
    db.add(log)
    db.commit()
    return {"message": f"Đã xóa lớp học {class_id} thành công."}
