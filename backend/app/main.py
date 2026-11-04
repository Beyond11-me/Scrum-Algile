import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import get_settings
from app.db.session import engine, Base, SessionLocal

import app.models  # Ensure models are loaded before create_all
Base.metadata.create_all(bind=engine)

# System roles and permissions are reference data.  This remains idempotent so
# local startup and container restarts do not duplicate records.
from app.services.rbac import seed_rbac_catalogue

with SessionLocal() as bootstrap_db:
    seed_rbac_catalogue(bootstrap_db)
    bootstrap_db.commit()

app = FastAPI(title="iSQL API", version="1.0.0")

# Set additional browser origins as a comma-separated list in deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-Roster-Enrolled",
        "X-Roster-Added",
        "X-Roster-Not-Found",
        "X-Roster-Report-Rows",
    ],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to iSQL API Backend!"}

@app.get("/healthz", include_in_schema=False)
def healthcheck():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok", "revision": os.getenv("APP_REVISION", "local")}

from app.routers import (
    auth,
    dashboard,
    problems,
    submissions,
    preferences,
    notifications,
    ai,
    admin_classes,
    admin_users,
    admin_overview,
    classes,
    assignments,
    student_assignments,
)

# Import routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin_classes.router, prefix="/api/admin/classes", tags=["Admin Classes"])
app.include_router(admin_users.router, prefix="/api/admin/users", tags=["Admin Users"])
app.include_router(admin_overview.router, prefix="/api/admin/overview", tags=["Admin Overview"])
app.include_router(classes.router, prefix="/api/teacher/classes", tags=["Teacher Classes"])
app.include_router(assignments.router)
app.include_router(student_assignments.router, prefix="/api/student/assignments", tags=["Student Assignments"])
app.include_router(problems.router, prefix="/api/problems", tags=["Problems"])
app.include_router(submissions.router, prefix="/api/submissions", tags=["Submissions"])
app.include_router(dashboard.router, prefix="/api/student/dashboard", tags=["Dashboard"])
app.include_router(preferences.router, prefix="/api/student/preferences", tags=["Preferences"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])
