import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./sqluit.db"

# Cấu hình engine cho SQL Server qua pyodbc hoặc SQLite
engine_kwargs = {}
if SQLALCHEMY_DATABASE_URL.startswith("mssql"):
    engine_kwargs["fast_executemany"] = True
elif SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    **engine_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency dùng để lấy session cho các request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
