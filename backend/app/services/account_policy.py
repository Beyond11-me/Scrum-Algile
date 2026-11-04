"""Shared checks for admin accounts and a signed-in user's own profile.

Admin-created passwords only have a length rule. A password a person chooses
for themselves must also mix character types. Generated passwords are built so
they already satisfy that stronger rule.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta

NAME_PATTERN = re.compile(r"^[A-Za-z ]{2,100}$")
CSV_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$")
EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

NAME_ERROR = "Use 2–100 letters and spaces, with no accents or digits."
CSV_NAME_ERROR = "The text before @ must be 2–100 letters, digits, dots, underscores, or hyphens."
EMAIL_ERROR = "Enter a valid email address."
PASSWORD_SHORT = "Password must be at least 8 characters."
PASSWORD_LONG = "Password must be at most 64 characters."
PASSWORD_COMPLEX = "Use 8–64 characters with an uppercase letter, a lowercase letter, a digit, and a symbol."
ROLE_ERROR = "Role must be Student, Lecturer, or Admin."
STATUS_ERROR = "Status must be Active or Inactive."
SELF_LOCK = "You cannot deactivate your account or change your own role."
LAST_ADMIN = "The last active admin cannot be deactivated or demoted."
SELF_REMOVE = "You cannot remove your own account."
LAST_ADMIN_REMOVE = "The last active admin cannot be removed."
CONFIRM_MISMATCH = "Type the account email exactly to confirm removal."
CURRENT_PASSWORD = "Current password is incorrect."
NOTHING_TO_CHANGE = "Change your name or password before saving."

PROFILE_COOLDOWN = timedelta(days=30)

ROLE_CODES = {
    "student": "student",
    "lecturer": "instructor",
    "instructor": "instructor",
    "admin": "admin",
}
DISPLAY_ROLES = {"student": "Student", "instructor": "Lecturer", "admin": "Admin"}
STATUS_VALUES = {"active": "Active", "inactive": "Inactive"}

_LOWER = "abcdefghijkmnopqrstuvwxyz"
_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_DIGITS = "23456789"
_SYMBOLS = "!@#$%*-_?"


def normalize_person_name(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def validate_person_name(value: str) -> str:
    name = normalize_person_name(value)
    if not NAME_PATTERN.fullmatch(name):
        raise ValueError(NAME_ERROR)
    return name


def name_from_email(email: str) -> str:
    """Use the mailbox name as the account name for a CSV row."""

    local = email.split("@", 1)[0]
    if not CSV_NAME_PATTERN.fullmatch(local):
        raise ValueError(CSV_NAME_ERROR)
    return local


def normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not email or len(email) > 255 or not EMAIL_PATTERN.fullmatch(email):
        raise ValueError(EMAIL_ERROR)
    return email


def email_taken_message(email: str) -> str:
    return f"Email '{email}' is already registered."


def validate_admin_password(value: str) -> str:
    password = value or ""
    if len(password) < 8:
        raise ValueError(PASSWORD_SHORT)
    if len(password) > 64:
        raise ValueError(PASSWORD_LONG)
    return password


def validate_complex_password(value: str) -> str:
    password = value or ""
    if (
        len(password) < 8
        or len(password) > 64
        or not re.search(r"[a-z]", password)
        or not re.search(r"[A-Z]", password)
        or not re.search(r"\d", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise ValueError(PASSWORD_COMPLEX)
    return password


def generate_password(length: int = 12) -> str:
    """Return a 12-character password that is hard to guess from a word list.

    Ambiguous characters (0, O, 1, l, I) are left out so an admin can read the
    one-time password aloud. Every password includes each character class.
    """

    if length < 8:
        raise ValueError("Generated passwords must be at least 8 characters.")
    rng = secrets.SystemRandom()
    chars = [rng.choice(_LOWER), rng.choice(_UPPER), rng.choice(_DIGITS), rng.choice(_SYMBOLS)]
    pool = _LOWER + _UPPER + _DIGITS + _SYMBOLS
    chars.extend(rng.choice(pool) for _ in range(length - 4))
    rng.shuffle(chars)
    return "".join(chars)


def canonical_role(value: str) -> str:
    code = ROLE_CODES.get((value or "").strip().lower())
    if code is None:
        raise ValueError(ROLE_ERROR)
    return code


def display_role(code: str | None) -> str:
    return DISPLAY_ROLES.get((code or "").lower(), "Student")


def canonical_status(value: str) -> str:
    status = STATUS_VALUES.get((value or "").strip().lower())
    if status is None:
        raise ValueError(STATUS_ERROR)
    return status


def initials_for(name: str) -> str:
    parts = [part for part in name.split() if part]
    letters = "".join(part[0] for part in parts[:2]) or name[:2]
    return (letters or "US").upper()


def profile_locked_until(last_change: datetime | None, now: datetime | None = None) -> datetime | None:
    """Return the next allowed time while a profile change is still locked."""

    if last_change is None:
        return None
    moment = now or datetime.utcnow()
    unlock = last_change + PROFILE_COOLDOWN
    if moment < unlock:
        return unlock
    return None


def cooldown_message(unlock: datetime) -> str:
    return f"You can change your name or password again on {unlock.strftime('%b %d, %Y')}."


def assert_admin_change(
    *,
    actor_email: str,
    target_email: str,
    target_is_active_admin: bool,
    other_active_admins: int,
    new_role: str,
    new_status: str,
) -> None:
    demoting = new_role != "admin" or new_status != "Active"
    if actor_email.lower() == target_email.lower() and demoting:
        raise ValueError(SELF_LOCK)
    if target_is_active_admin and demoting and other_active_admins <= 0:
        raise ValueError(LAST_ADMIN)


def assert_account_removal(
    *,
    actor_email: str,
    target_email: str,
    target_is_active_admin: bool,
    other_active_admins: int,
) -> None:
    if actor_email.lower() == target_email.lower():
        raise ValueError(SELF_REMOVE)
    if target_is_active_admin and other_active_admins <= 0:
        raise ValueError(LAST_ADMIN_REMOVE)
