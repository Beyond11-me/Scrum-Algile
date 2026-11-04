"""Create many accounts from an admin CSV.

The file has an email column and an optional role column. The account name is
the text before @, and every password is generated here.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import apply_password
from app.models import ActivityLog, User
from app.services.account_policy import (
    canonical_role,
    display_role,
    email_taken_message,
    generate_password,
    initials_for,
    name_from_email,
    normalize_email,
)
from app.services.rbac import assign_user_role


@dataclass
class AccountImportResult:
    created: int
    duplicates: int
    invalid: int
    report_csv: str


def parse_account_csv(raw: bytes) -> list[tuple[str, str]]:
    """Return ``(email cell, role cell)`` pairs in file order.

    A header row is recognized when one cell is ``email``. ``role`` is optional.
    A headerless file uses the first column as email and the second, when
    present, as role. Blank rows are skipped.
    """

    text = raw.decode("utf-8-sig")
    if not text.strip():
        return []

    sample = text[:4096]
    if sample.count(";") > sample.count(","):
        delimiter = ";"
    elif sample.count("\t") > sample.count(","):
        delimiter = "\t"
    else:
        delimiter = ","

    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    start = 0
    while start < len(rows) and not any(cell.strip() for cell in rows[start]):
        start += 1
    if start >= len(rows):
        return []

    header = [cell.strip().lower() for cell in rows[start]]
    email_index = 0
    role_index = 1 if len(header) > 1 else None
    if "email" in header:
        email_index = header.index("email")
        role_index = header.index("role") if "role" in header else None
        start += 1

    parsed: list[tuple[str, str]] = []
    for row in rows[start:]:
        if not any(cell.strip() for cell in row):
            continue
        email = row[email_index].strip() if email_index < len(row) else ""
        role = row[role_index].strip() if role_index is not None and role_index < len(row) else ""
        if email or role:
            parsed.append((email, role))
    return parsed


def _report(rows: list[tuple[str, str, str, str, str, str]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(["email", "name", "role", "status", "password", "message"])
    writer.writerows(rows)
    return buffer.getvalue()


def import_accounts(db: Session, admin: User, raw: bytes) -> AccountImportResult:
    try:
        incoming = parse_account_csv(raw)
    except UnicodeDecodeError as exc:
        raise ValueError("The CSV file must be UTF-8.") from exc
    if not incoming:
        raise ValueError("The CSV file has no account rows.")

    report: list[tuple[str, str, str, str, str, str]] = []
    seen: set[str] = set()
    created = duplicates = invalid = 0

    for email_cell, role_cell in incoming:
        try:
            email = normalize_email(email_cell)
        except ValueError as exc:
            invalid += 1
            report.append((email_cell.strip(), "", role_cell, "invalid", "", str(exc)))
            continue

        if email in seen or db.query(User).filter(func.lower(User.email) == email).first():
            duplicates += 1
            seen.add(email)
            report.append((email, "", role_cell or "Student", "duplicate", "", email_taken_message(email)))
            continue

        try:
            role = canonical_role(role_cell or "Student")
            name = name_from_email(email)
            password = generate_password()
        except ValueError as exc:
            invalid += 1
            report.append((email, "", role_cell, "invalid", "", str(exc)))
            continue

        user = User(
            email=email,
            name=name,
            initials=initials_for(name),
            status="Active",
        )
        apply_password(user, password)
        db.add(user)
        assign_user_role(db, user, role)
        seen.add(email)
        created += 1
        report.append((email, name, display_role(role), "created", password, "Created"))

    if created:
        db.add(ActivityLog(user_id=admin.id, action=f"Imported {created} accounts from CSV"))
    db.commit()
    return AccountImportResult(created, duplicates, invalid, _report(report))
