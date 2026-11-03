"""SQLAlchemy engine and request-scoped session management."""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings


SQLALCHEMY_DATABASE_URL = get_settings().database_url
engine_kwargs: dict[str, object] = {}
if SQLALCHEMY_DATABASE_URL.startswith("mssql"):
    engine_kwargs["fast_executemany"] = True
elif SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
