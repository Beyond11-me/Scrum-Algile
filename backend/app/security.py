"""Backward-compatible security imports.

New code should import from :mod:`app.core.security`.
"""

from app.core.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)

__all__ = ["create_access_token", "decode_access_token", "get_password_hash", "verify_password"]
