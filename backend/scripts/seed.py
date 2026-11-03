import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from passlib.context import CryptContext
from app.db.session import SessionLocal, engine, Base
from app.models import User, Problem, Submission
from app.services.rbac import assign_user_role, seed_rbac_catalogue
import uuid

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def seed_data():
    db = SessionLocal()
    seed_rbac_catalogue(db)
    
    # 1. Tạo User mẫu
    demo_user = db.query(User).filter(User.email == "student@demo.local").first()
    if not demo_user:
        demo_user = User(
            id="student-demo",
            email="student@demo.local",
            hashed_password=get_password_hash("password123"), # Mật khẩu giả định
            name="Huy Lai",
            initials="HL",
            role="student"
        )
        db.add(demo_user)
        assign_user_role(db, demo_user, "student")
        print("Đã tạo User: student@demo.local")
    else:
        assign_user_role(db, demo_user, "student")

    # 1.5 Tạo Instructor mẫu
    instructor_user = db.query(User).filter(User.email == "instructor@demo.local").first()
    if not instructor_user:
        instructor_user = User(
            id="instructor-demo",
            email="instructor@demo.local",
            hashed_password=get_password_hash("password123"),
            name="Giảng Viên",
            initials="GV",
            role="instructor"
        )
        db.add(instructor_user)
        assign_user_role(db, instructor_user, "instructor")
        print("Đã tạo User: instructor@demo.local")
    else:
        assign_user_role(db, instructor_user, "instructor")

    # 1.6 Tạo Admin mẫu
    admin_user = db.query(User).filter(User.email == "admin@demo.local").first()
    if not admin_user:
        admin_user = User(
            id="admin-demo",
            email="admin@demo.local",
            hashed_password=get_password_hash("123"),
            name="Quản Trị Viên",
            initials="AD",
            role="admin"
        )
        db.add(admin_user)
        assign_user_role(db, admin_user, "admin")
        print("Đã tạo User: admin@demo.local")
    else:
        assign_user_role(db, admin_user, "admin")

    db.commit()
    db.close()
    print("Seeding hoàn tất!")

if __name__ == "__main__":
    # Tự động tạo bảng nếu chưa có (chắc chắn hơn)
    Base.metadata.create_all(bind=engine)
    seed_data()
