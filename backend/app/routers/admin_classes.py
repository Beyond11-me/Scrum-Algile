from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models import User, Class, ClassEnrollment
from app.routers.auth import get_current_user

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên (Admin) mới có quyền truy cập."
        )
    return current_user

class ClassCreateRequest(BaseModel):
    id: str
    course: str
    term: str
    instructor_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class ClassResponse(BaseModel):
    id: str
    course: str
    term: str
    instructor_id: Optional[str] = None
    instructor_name: Optional[str] = None
    students: int = 0
    status: str = "Active"
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class LecturerOption(BaseModel):
    id: str
    name: str
    email: str

@router.get("", response_model=List[ClassResponse])
def get_admin_classes(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    classes = db.query(Class).all()
    results = []
    for c in classes:
        instructor = db.query(User).filter(User.id == c.instructor_id).first() if c.instructor_id else None
        student_count = db.query(ClassEnrollment).filter(ClassEnrollment.class_id == c.id).count()
        results.append(ClassResponse(
            id=c.id,
            course=c.course,
            term=c.term,
            instructor_id=c.instructor_id,
            instructor_name=instructor.name if instructor else "Chưa gán",
            students=student_count,
            status=c.status or "Active",
            start_date=c.start_date,
            end_date=c.end_date
        ))
    return results

@router.get("/lecturers", response_model=List[LecturerOption])
def get_lecturers_for_class(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    lecturers = db.query(User).filter(User.role == "instructor").all()
    return [LecturerOption(id=u.id, name=u.name, email=u.email) for u in lecturers]

@router.post("", response_model=ClassResponse)
def create_class(req: ClassCreateRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    class_id = req.id.strip()
    if not class_id:
        raise HTTPException(status_code=400, detail="Mã lớp không được để trống.")
        
    existing = db.query(Class).filter(Class.id == class_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Mã lớp '{class_id}' đã tồn tại.")

    new_class = Class(
        id=class_id,
        course=req.course.strip(),
        term=req.term.strip(),
        instructor_id=req.instructor_id if req.instructor_id else None,
        start_date=req.start_date,
        end_date=req.end_date,
        status="Active"
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    
    instructor = db.query(User).filter(User.id == new_class.instructor_id).first() if new_class.instructor_id else None
    return ClassResponse(
        id=new_class.id,
        course=new_class.course,
        term=new_class.term,
        instructor_id=new_class.instructor_id,
        instructor_name=instructor.name if instructor else "Chưa gán",
        students=0,
        status="Active",
        start_date=new_class.start_date,
        end_date=new_class.end_date
    )

@router.delete("/{class_id}")
def delete_class(class_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    c = db.query(Class).filter(Class.id == class_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học.")
        
    db.query(ClassEnrollment).filter(ClassEnrollment.class_id == class_id).delete()
    db.delete(c)
    db.commit()
    return {"message": f"Đã xóa lớp {class_id} thành công."}
