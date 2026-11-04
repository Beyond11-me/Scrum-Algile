"""Permanently remove an account and the rows that belong only to that person.

Classes, assignments, and problems stay. A class or assignment they taught
loses this person as its lecturer, and a problem they created stays unassigned.
"""

from sqlalchemy.orm import Session

from app.models import (
    ActivityLog,
    AiChatMessage,
    AiChatSession,
    Assignment,
    Class,
    ClassEnrollment,
    Favorite,
    Notification,
    Problem,
    ProblemDraft,
    ProblemList,
    ProblemListItem,
    Submission,
    User,
)


def purge_account(db: Session, actor: User, user: User) -> None:
    user_id = user.id
    email = user.email

    session_ids = [row.id for row in db.query(AiChatSession.id).filter(AiChatSession.user_id == user_id)]
    if session_ids:
        db.query(AiChatMessage).filter(AiChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(AiChatSession).filter(AiChatSession.id.in_(session_ids)).delete(synchronize_session=False)

    list_ids = [row.id for row in db.query(ProblemList.id).filter(ProblemList.user_id == user_id)]
    if list_ids:
        db.query(ProblemListItem).filter(ProblemListItem.list_id.in_(list_ids)).delete(synchronize_session=False)
        db.query(ProblemList).filter(ProblemList.id.in_(list_ids)).delete(synchronize_session=False)

    db.query(ProblemDraft).filter(ProblemDraft.user_id == user_id).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.user_id == user_id).delete(synchronize_session=False)
    db.query(Submission).filter(Submission.user_id == user_id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
    db.query(ClassEnrollment).filter(ClassEnrollment.student_id == user_id).delete(synchronize_session=False)
    db.query(ActivityLog).filter(ActivityLog.user_id == user_id).update({ActivityLog.user_id: None}, synchronize_session=False)
    db.query(Problem).filter(Problem.creator_id == user_id).update({Problem.creator_id: None}, synchronize_session=False)
    db.query(Class).filter(Class.instructor_id == user_id).update({Class.instructor_id: None}, synchronize_session=False)
    db.query(Assignment).filter(Assignment.instructor_id == user_id).update({Assignment.instructor_id: None}, synchronize_session=False)

    db.delete(user)
    db.add(ActivityLog(user_id=actor.id, action=f"Admin {actor.email} permanently removed account {email}"))
    db.commit()
