"""Centralised environment configuration for the backend."""

from dataclasses import dataclass
from functools import lru_cache
import os

from dotenv import load_dotenv


load_dotenv()


DEFAULT_LOCAL_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
)


@dataclass(frozen=True)
class Settings:
    database_url: str
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    cors_origins: tuple[str, ...]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    configured_origins = tuple(
        origin.strip().rstrip("/")
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    )
    origins = tuple(dict.fromkeys((*DEFAULT_LOCAL_ORIGINS, *configured_origins)))
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite:///./sqluit.db"),
        secret_key=os.getenv("SECRET_KEY", "your-super-secret-jwt-key"),
        algorithm=os.getenv("ALGORITHM", "HS256"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")),
        cors_origins=origins,
    )
