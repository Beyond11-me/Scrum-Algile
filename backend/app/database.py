"""Backward-compatible database imports.

New code should import from :mod:`app.db.session`.
"""

from app.db.session import Base, SessionLocal, engine, get_db

__all__ = ["Base", "SessionLocal", "engine", "get_db"]
