"""Password hashing and access-token helpers.

The authentication routes continue to own login behaviour.  This module only
contains reusable cryptographic primitives so other layers do not read the
environment directly.

Admins can read the current password of an account. The login hash stays
one-way. A second value, sealed with the server secret, is what the admin
screen decrypts.
"""

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _password_key() -> bytes:
    return hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest()


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    chunks = []
    counter = 0
    produced = 0
    while produced < length:
        block = hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        chunks.append(block)
        produced += len(block)
        counter += 1
    return b"".join(chunks)[:length]


def seal_password(password: str) -> str:
    """Return a reversible copy that only this server can open."""

    key = _password_key()
    nonce = os.urandom(16)
    plain = password.encode("utf-8")
    cipher = bytes(left ^ right for left, right in zip(plain, _keystream(key, nonce, len(plain))))
    mac = hmac.new(key, nonce + cipher, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + mac + cipher).decode("ascii")


def open_password(token: str | None) -> str | None:
    """Return the stored password, or None when it was never saved or no longer opens."""

    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii"))
        nonce, mac, cipher = raw[:16], raw[16:48], raw[48:]
        key = _password_key()
        expected = hmac.new(key, nonce + cipher, hashlib.sha256).digest()
        if not hmac.compare_digest(mac, expected):
            return None
        plain = bytes(left ^ right for left, right in zip(cipher, _keystream(key, nonce, len(cipher))))
        return plain.decode("utf-8")
    except (ValueError, UnicodeError):
        return None


def apply_password(user, password: str) -> None:
    """Store a login hash and the admin-visible copy together."""

    user.hashed_password = get_password_hash(password)
    user.password_record = seal_password(password)


def store_known_password(user, password: str) -> bool:
    """Save the password an account just proved it knows. Returns True when the copy changed."""

    if open_password(getattr(user, "password_record", None)) == password:
        return False
    user.password_record = seal_password(password)
    return True


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload = data.copy()
    payload.update({"exp": expire})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.PyJWTError:
        return None
