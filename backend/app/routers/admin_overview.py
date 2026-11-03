from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from app.database import get_db
from app.models import User, Class, Submission, Problem, ActivityLog
from app.routers.auth import get_current_user

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)):
    if getattr(current_user, "role", "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên (Admin) mới có quyền truy cập."
        )
    return current_user

class OverviewStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    users: int = 0
    classes: int = 0
    pending_requests: int = Field(default=0, alias="pendingRequests")
    unassigned_classes: int = Field(default=0, alias="unassignedClasses")
    submissions_today: int = Field(default=0, alias="submissionsToday")
    grading_errors: int = Field(default=0, alias="gradingErrors")

class ActivityLogResponse(BaseModel):
    id: str
    action: str
    by: str
    time: str

class GradingErrorResponse(BaseModel):
    id: str
    problem_title: str
    error_type: str

@router.get("/stats", response_model=OverviewStats)
def get_overview_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users_count = db.query(User).count()
    active_classes = db.query(Class).filter(Class.status == "Active").count()
    
    today = datetime.utcnow().date()
    today_start = datetime(today.year, today.month, today.day)
    submissions_today = db.query(Submission).filter(Submission.submitted_at >= today_start).count()
    
    grading_errors = db.query(Submission).filter(
        (Submission.result.ilike("%error%")) | 
        (Submission.result.ilike("%timeout%"))
    ).count()
    
    pending_requests = db.query(User).filter(
        User.role == "instructor",
        User.status == "Pending"
    ).count()
    
    unassigned_classes = db.query(Class).filter(
        Class.status != "Archived",
        Class.instructor_id == None
    ).count()
    
    return OverviewStats(
        users=users_count,
        classes=active_classes,
        pending_requests=pending_requests,
        unassigned_classes=unassigned_classes,
        submissions_today=submissions_today,
        grading_errors=grading_errors
    )

@router.get("/activities", response_model=List[ActivityLogResponse])
def get_activities(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    logs = db.query(ActivityLog).order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(15).all()
    results = []
    for log in logs:
        time_str = log.created_at.isoformat() + "Z" if log.created_at else ""
        by_str = log.user.name if log.user else "Hệ thống"
        results.append(ActivityLogResponse(
            id=str(log.id),
            action=log.action,
            by=by_str,
            time=time_str
        ))
    return results

@router.get("/errors", response_model=List[GradingErrorResponse])
def get_errors(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    errors = db.query(Submission).filter(
        (Submission.result.ilike("%error%")) | 
        (Submission.result.ilike("%timeout%"))
    ).order_by(Submission.submitted_at.desc(), Submission.id.desc()).limit(10).all()
    
    results = []
    for error in errors:
        problem = db.query(Problem).filter(Problem.id == error.problem_id).first()
        title = problem.title if problem else "Unknown problem"
        results.append(GradingErrorResponse(
            id=str(error.id),
            problem_title=title,
            error_type=error.result
        ))
    return results

