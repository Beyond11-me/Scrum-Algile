import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.database import engine, Base

import app.models # Ensure models are loaded before create_all
Base.metadata.create_all(bind=engine)

app = FastAPI(title="iSQL API", version="1.0.0")

# Set additional browser origins as a comma-separated list in deployment.
local_origins = ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"]
configured_origins = [origin.strip().rstrip("/") for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(local_origins + configured_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

from app.routers import auth, dashboard, problems, submissions, preferences, notifications, ai, admin_classes, classes, assignments, student_assignments

# Import routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin_classes.router, prefix="/api/admin/classes", tags=["Admin Classes"])
app.include_router(classes.router, prefix="/api/teacher/classes", tags=["Teacher Classes"])
app.include_router(assignments.router)
app.include_router(student_assignments.router, prefix="/api/student/assignments", tags=["Student Assignments"])
app.include_router(problems.router, prefix="/api/problems", tags=["Problems"])
app.include_router(submissions.router, prefix="/api/submissions", tags=["Submissions"])
app.include_router(dashboard.router, prefix="/api/student/dashboard", tags=["Dashboard"])
app.include_router(preferences.router, prefix="/api/student/preferences", tags=["Preferences"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])
