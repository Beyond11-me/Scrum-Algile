from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from app.db.session import get_db
from app.models import Assignment, AssignmentClass, AssignmentProblem, ClassEnrollment, User, Problem, Submission, TestCase, TestCaseScript, Topic, ProblemTopic, ProblemDraft, Favorite, ProblemListItem, AiChatSession, AiChatMessage, Notification
from app.schemas import ProblemListResponse, ProblemDetailResponse, QueryRequest, ProblemCreate, TestCaseCreate, ProblemValidateRequest, TrendingProblem
from app.dependencies.auth import get_current_user
from app.services.sandbox import run_sandbox, run_validate_sandbox
from sqlalchemy import func, case
import uuid
import datetime

router = APIRouter()

def owned_problem_query(db: Session, current_user: User):
    return db.query(Problem).filter(Problem.creator_id == current_user.id)

def normalize_topics(value: str | None) -> list[str]:
    return list(dict.fromkeys(topic.strip().upper() for topic in (value or "").split(",") if topic.strip()))

def validate_problem_payload(db: Session, problem: ProblemCreate) -> None:
    cases = problem.test_cases or [TestCaseCreate(schema_sql=problem.schema_sql, seed_data=problem.seed_data)]
    for index, case in enumerate(cases, 1):
        result = run_validate_sandbox(db, case.schema_sql or problem.schema_sql, case.seed_data, problem.reference_solution)
        db.rollback()  # Discard sandbox setup before checking the next dataset or writing the problem.
        if result["status"] != "Success":
            raise HTTPException(status_code=400, detail=f"Reference solution failed on test case {index}: {result['message']}")

def check_problem_access(db: Session, current_user: User, p: Problem):
    if p.practice_listed or current_user.role == "admin":
        return True
    if current_user.role == "instructor":
        return True
    return False


def require_student_query_access(
    db: Session,
    current_user: User,
    problem: Problem,
    source: str | None,
    context: str | None,
) -> tuple[str, str]:
    """Validate the source/context sent from the workspace before running SQL.

    A student may practise a public problem, or work on a published and open
    activity that contains the problem and is assigned to that student.  The
    same validated values are stored with a submission, so assignment and
    contest progress remain accurate in the UI.
    """

    source = source or "Practice"
    context = context or "Practice"
    if current_user.status != "Active":
        raise HTTPException(status_code=403, detail="Only active students can work on problems.")

    if source == "Practice":
        if context != "Practice" or problem.archived_at is not None or not problem.practice_listed:
            raise HTTPException(status_code=403, detail="This problem is not available for practice.")
        return source, context

    if source not in {"Assignments", "Contests"} or context == "Practice":
        raise HTTPException(status_code=403, detail="Invalid activity context.")

    activity = db.query(Assignment).filter(Assignment.id == context).first()
    if (
        activity is None
        or not activity.published
        or activity.is_contest != (source == "Contests")
        or (activity.opens is not None and activity.opens > datetime.datetime.utcnow())
        or (activity.closes is not None and activity.closes <= datetime.datetime.utcnow())
    ):
        raise HTTPException(status_code=403, detail="This activity is not currently available.")

    contains_problem = db.query(AssignmentProblem).filter(
        AssignmentProblem.assignment_id == activity.id,
        AssignmentProblem.problem_id == problem.id,
    ).first()
    if not contains_problem:
        raise HTTPException(status_code=403, detail="This problem is not part of the activity.")

    if activity.is_contest and activity.audience_type == "all_students":
        return source, context

    has_enrollment = db.query(ClassEnrollment).join(
        AssignmentClass, AssignmentClass.class_id == ClassEnrollment.class_id,
    ).filter(
        AssignmentClass.assignment_id == activity.id,
        ClassEnrollment.student_id == current_user.id,
    ).first()
    if not has_enrollment:
        raise HTTPException(status_code=403, detail="You are not assigned to this activity.")
    return source, context

@router.get("/trending", response_model=List[TrendingProblem])
def get_trending(range: str = "Week", db: Session = Depends(get_db)):
    query = db.query(
        Submission.problem_id, 
        Problem.number,
        Problem.title,
        func.count(func.distinct(Submission.user_id)).label("learners")
    ).join(Problem, Problem.id == Submission.problem_id).filter(Problem.practice_listed == True)
    
    if range == "Week":
        start_date = datetime.datetime.utcnow() - datetime.timedelta(days=7)
        query = query.filter(Submission.submitted_at >= start_date)
    elif range == "Month": 
        start_date = datetime.datetime.utcnow() - datetime.timedelta(days=30)
        query = query.filter(Submission.submitted_at >= start_date)
        
    results = query.group_by(
        Submission.problem_id, 
        Problem.number, 
        Problem.title
    ).order_by(func.count(func.distinct(Submission.user_id)).desc()).limit(5).all()
    
    return [TrendingProblem(id=r[0], number=r[1], title=r[2], learners=r[3]) for r in results]

@router.get("", response_model=List[ProblemListResponse])
def get_problems(include_archived: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "instructor":
        query = owned_problem_query(db, current_user)
        if not include_archived:
            query = query.filter(Problem.archived_at.is_(None))
        problems = query.all()
    elif current_user.role == "admin":
        query = db.query(Problem)
        if not include_archived:
            query = query.filter(Problem.archived_at.is_(None))
        problems = query.all()
    else:
        problems = db.query(Problem).filter(Problem.practice_listed == True, Problem.archived_at.is_(None)).all()
        
    # Progress cho current_user
    subs = db.query(Submission.problem_id, Submission.result).filter(Submission.user_id == current_user.id).all()
    
    status_map = {}
    for problem_id, result in subs:
        if status_map.get(problem_id) == "Solved":
            continue
        if result == "Accepted":
            status_map[problem_id] = "Solved"
        else:
            status_map[problem_id] = "In progress"

    stats_query = db.query(
        Submission.problem_id,
        func.count(Submission.id).label("total_subs"),
        func.count(func.distinct(Submission.user_id)).label("attempted"),
        func.count(func.distinct(case((Submission.result == 'Accepted', Submission.user_id), else_=None))).label("solved_by"),
        func.sum(case((Submission.result == 'Accepted', 1), else_=0)).label("accepted_subs")
    ).group_by(Submission.problem_id).all()

    stats_map = {}
    for r in stats_query:
        problem_id, total_subs, attempted, solved_by, accepted_subs = r
        acceptance = int((accepted_subs / total_subs * 100)) if total_subs > 0 else 0
        stats_map[problem_id] = {
            "submissions": total_subs,
            "attempted": attempted,
            "solved_by": solved_by,
            "acceptance": acceptance
        }

    result_list = []
    for p in problems:
        resp = ProblemListResponse.model_validate(p)
        resp.progress = status_map.get(p.id)
        
        p_stats = stats_map.get(p.id, {"submissions": 0, "attempted": 0, "solved_by": 0, "acceptance": 0})
        resp.submissions = p_stats["submissions"]
        resp.attempted = p_stats["attempted"]
        resp.solved_by = p_stats["solved_by"]
        resp.acceptance = p_stats["acceptance"]
        
        result_list.append(resp)
    
    return result_list

@router.get("/{problem_id}", response_model=ProblemDetailResponse)
def get_problem(problem_id: str, context: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Problem).filter(Problem.id == problem_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Problem not found")
        
    if current_user.role == "instructor":
        if p.creator_id != current_user.id:
            raise HTTPException(status_code=404, detail="Problem not found")
    elif current_user.role != "admin" and (not check_problem_access(db, current_user, p) or p.archived_at is not None):
        raise HTTPException(status_code=403, detail="You don't have permission to view this problem.")
                
    subs = db.query(Submission.result).filter(
        Submission.user_id == current_user.id,
        Submission.problem_id == p.id
    ).all()
    
    progress = None
    if subs:
        if any(sub.result == "Accepted" for sub in subs):
            progress = "Solved"
        else:
            progress = "In progress"
            
    resp = ProblemDetailResponse.model_validate(p)
    resp.progress = progress
    if current_user.role in ("instructor", "admin"):
        resp.submission_count = db.query(Submission).filter(Submission.problem_id == p.id).count()
    
    tcs = db.query(TestCase).filter(TestCase.problem_id == p.id).order_by(TestCase.order_index).all()
    if tcs:
        mapped_tcs = []
        for idx, tc in enumerate(tcs):
            if tc.is_hidden and current_user.role == "student":
                continue
            script = db.query(TestCaseScript).filter(TestCaseScript.test_case_id == tc.id).first()
            if script:
                mapped_tcs.append({
                    "schema": script.create_script,
                    "seedData": script.insert_script,
                    "isHidden": tc.is_hidden
                })
                if idx == 0:
                    resp.schema_sql = script.create_script
                    resp.seed_data = script.insert_script
                    if current_user.role == "instructor":
                        resp.reference_solution = tc.expected_query or ""
                    else:
                        resp.reference_solution = ""
        resp.test_cases = mapped_tcs
        
    return resp

@router.put("/{problem_id}", response_model=ProblemDetailResponse)
def update_problem(problem_id: str, problem: ProblemCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "instructor":
        raise HTTPException(status_code=403, detail="Chỉ Giảng viên mới có quyền sửa bài tập.")
        
    p = db.query(Problem).filter(Problem.id == problem_id, Problem.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Problem not found")
    if p.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the question owner can edit it.")

    validate_problem_payload(db, problem)
        
    topics_list = normalize_topics(problem.topics)
    
    p.number = problem.number
    p.title = problem.title
    p.topic = problem.topics
    p.topics = topics_list
    p.difficulty = problem.difficulty
    p.practice_listed = (problem.visibility == "Public")
    p.description = problem.statement
    p.requirements = problem.requirements
    p.hint = "\n".join(problem.hints) if problem.hints else None
    p.database_type = problem.database
    
    db.query(ProblemTopic).filter(ProblemTopic.problem_id == problem_id).delete()
    for t_name in topics_list:
        if not t_name: continue
        topic_obj = db.query(Topic).filter(Topic.name == t_name).first()
        if not topic_obj:
            topic_obj = Topic(id=str(uuid.uuid4()), name=t_name)
            db.add(topic_obj)
            db.flush()
        pt = ProblemTopic(problem_id=problem_id, topic_id=topic_obj.id)
        db.add(pt)
        
    old_tcs = db.query(TestCase).filter(TestCase.problem_id == problem_id).all()
    for tc in old_tcs:
        db.query(TestCaseScript).filter(TestCaseScript.test_case_id == tc.id).delete()
    db.query(TestCase).filter(TestCase.problem_id == problem_id).delete()
    
    test_cases_to_create = problem.test_cases if problem.test_cases else [
        TestCaseCreate(schema_sql=problem.schema_sql, seed_data=problem.seed_data, is_hidden=False)
    ]
    
    for idx, tc_data in enumerate(test_cases_to_create):
        tc_id = str(uuid.uuid4())
        tc = TestCase(
            id=tc_id,
            problem_id=problem_id,
            is_hidden=tc_data.is_hidden,
            order_index=idx + 1,
            expected_query=problem.reference_solution
        )
        db.add(tc)
        
        tcs = TestCaseScript(
            id=str(uuid.uuid4()),
            test_case_id=tc_id,
            table_name="Generated", 
            create_script=tc_data.schema_sql or problem.schema_sql,
            insert_script=tc_data.seed_data,
            is_expected=False
        )
        db.add(tcs)
        
    try:
        db.commit()
        db.refresh(p)
    except Exception:
        db.rollback()
        raise
    return get_problem(problem_id, None, db, current_user)

@router.delete("/{problem_id}")
def delete_problem(problem_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "instructor":
        raise HTTPException(status_code=403, detail="Chỉ Giảng viên mới có quyền xóa bài tập.")
        
    p = db.query(Problem).filter(Problem.id == problem_id, Problem.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Problem not found")
    if p.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the question owner can archive it.")
    submission_count = db.query(Submission).filter(Submission.problem_id == problem_id).count()
    if submission_count:
        raise HTTPException(status_code=409, detail=f"Cannot archive: this question has {submission_count} submission(s). Set it to Private instead.")
    p.archived_at = datetime.datetime.utcnow()
    p.practice_listed = False
    db.commit()
    return {"message": "Question archived; submissions and scores were preserved."}

@router.post("/{problem_id}/restore")
def restore_problem(problem_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "instructor":
        raise HTTPException(status_code=403, detail="Only instructors can restore questions.")
    p = owned_problem_query(db, current_user).filter(Problem.id == problem_id, Problem.archived_at.is_not(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Archived question not found in your question bank")
    p.archived_at = None
    db.commit()
    return {"message": "Question restored."}

@router.post("", response_model=ProblemDetailResponse)
def create_problem(problem: ProblemCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "instructor":
        raise HTTPException(status_code=403, detail="Chỉ Giảng viên mới có quyền tạo bài tập.")

    validate_problem_payload(db, problem)
        
    prob_id = str(uuid.uuid4())
    topics_list = normalize_topics(problem.topics)
    legacy_topic = problem.topics

    new_prob = Problem(
        id=prob_id,
        number=problem.number,
        title=problem.title,
        topic=legacy_topic,
        topics=topics_list,
        difficulty=problem.difficulty,
        practice_listed=(problem.visibility == "Public"),
        description=problem.statement,
        requirements=problem.requirements,
        hint="\n".join(problem.hints) if problem.hints else None,
        database_type=problem.database,
        creator_id=current_user.id
    )
    db.add(new_prob)
    
    for t_name in topics_list:
        if not t_name: continue
        topic_obj = db.query(Topic).filter(Topic.name == t_name).first()
        if not topic_obj:
            topic_obj = Topic(id=str(uuid.uuid4()), name=t_name)
            db.add(topic_obj)
            db.flush()
        
        pt = ProblemTopic(problem_id=prob_id, topic_id=topic_obj.id)
        db.add(pt)
        
    test_cases_to_create = problem.test_cases if problem.test_cases else [
        TestCaseCreate(schema_sql=problem.schema_sql, seed_data=problem.seed_data, is_hidden=False)
    ]
    
    for idx, tc_data in enumerate(test_cases_to_create):
        tc_id = str(uuid.uuid4())
        tc = TestCase(
            id=tc_id,
            problem_id=prob_id,
            is_hidden=tc_data.is_hidden,
            order_index=idx + 1,
            expected_query=problem.reference_solution
        )
        db.add(tc)
        
        tcs = TestCaseScript(
            id=str(uuid.uuid4()),
            test_case_id=tc_id,
            table_name="Generated", 
            create_script=tc_data.schema_sql or problem.schema_sql,
            insert_script=tc_data.seed_data,
            is_expected=False
        )
        db.add(tcs)
    
    try:
        db.commit()
        db.refresh(new_prob)
    except Exception:
        db.rollback()
        raise
    
    return get_problem(prob_id, None, db, current_user)

@router.post("/validate")
def validate_problem_solution(request: ProblemValidateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "instructor":
        raise HTTPException(status_code=403, detail="Chỉ Giảng viên mới có quyền sử dụng công cụ kiểm tra Sandbox.")
        
    result = run_validate_sandbox(db, request.schema_sql, request.seed_data, request.reference_solution)
    if result["status"] == "Error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.post("/{problem_id}/run")
def run_query(problem_id: str, request: QueryRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Problem).filter(Problem.id == problem_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Problem not found")
    if current_user.role == "student":
        require_student_query_access(db, current_user, p, request.source, request.context)
    elif current_user.role not in ("instructor", "admin"):
        raise HTTPException(status_code=403, detail="You don't have permission to run this problem.")
        
    result = run_sandbox(db, p, request.query, is_submit=False, allow_hidden=current_user.role != "student")
    return result

@router.post("/{problem_id}/submit")
def submit_query(problem_id: str, request: QueryRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Problem).filter(Problem.id == problem_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Problem not found")
    source = request.source or "Practice"
    context = request.context or "Practice"
    if current_user.role == "student":
        source, context = require_student_query_access(db, current_user, p, source, context)
    elif current_user.role not in ("instructor", "admin"):
        raise HTTPException(status_code=403, detail="You don't have permission to submit this problem.")

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Write a SQL query before submitting.")

    max_score = 100
    result = run_sandbox(db, p, request.query, is_submit=True)
    
    status = result.get("status", "Runtime Error")
    passed = result.get("passed", 0)
    total = result.get("total", 1)
    
    if status == "Accepted":
        score = max_score
    elif status == "Partial":
        score = int((passed / total) * max_score)
    else:
        score = 0
    
    sub = Submission(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        problem_id=p.id,
        source=source,
        context=context,
        result=status,
        score=score,
        query_text=request.query,
        database_type=request.database or "SQL Server"
    )
    db.add(sub)
    
    today = datetime.datetime.utcnow().date()
    last_date = current_user.last_streak_date.date() if current_user.last_streak_date else None
    
    if last_date != today:
        if last_date == today - datetime.timedelta(days=1):
            current_user.current_streak = (current_user.current_streak or 0) + 1
            
            milestones = [3, 5, 7, 10, 30, 50, 100, 365]
            if current_user.current_streak in milestones or (current_user.current_streak > 10 and current_user.current_streak % 10 == 0):
                notif = Notification(
                    id=str(uuid.uuid4()),
                    user_id=current_user.id,
                    title="Cột mốc chuỗi học tập!",
                    message=f"🔥 Chúc mừng! Bạn đã duy trì chuỗi học tập {current_user.current_streak} ngày liên tiếp.",
                    type="Milestone",
                    link="/practice"
                )
                db.add(notif)
        elif last_date is None or last_date < today - datetime.timedelta(days=1):
            current_user.current_streak = 1
            
        current_user.last_streak_date = datetime.datetime.utcnow()
        if (current_user.current_streak or 0) > (current_user.longest_streak or 0):
            current_user.longest_streak = current_user.current_streak
            
    db.commit()
    db.refresh(sub)
    
    public_result = {key: value for key, value in result.items() if key not in {"table", "passed", "total"}}
    if current_user.role == "student" and status in {"Partial", "Wrong Answer"}:
        public_result["message"] = "Kết quả chưa đúng với tất cả bộ kiểm thử."
    return {
        **public_result,
        "submission_id": sub.id,
        "score": score
    }
