"""Parse a class roster CSV and enroll matching students.

The result file lists emails that were not enrolled, with a status for each row.
An email with no matching account is reported as not found.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ActivityLog, ClassEnrollment, User


HEADER_NAMES = {"email", "student_email", "student_id", "studentid", "id", "mail"}

STATUS_NOT_FOUND = "not found"
STATUS_ADDED = "added"
STATUS_INACTIVE = "inactive"
STATUS_NOT_STUDENT = "not a student"


def classify_roster_token(
    token: str,
    *,
    user_role: str | None,
    user_status: str | None,
    already_enrolled: bool,
) -> tuple[str, str | None]:
    """Return the report email and a status, or ``None`` when the account should be enrolled.

    ``user_role`` is ``None`` when no account uses this email.
    """

    email = token.strip().lower()
    if user_role is None:
        return email, STATUS_NOT_FOUND
    if user_role.lower() != "student":
        return email, STATUS_NOT_STUDENT
    if (user_status or "").lower() != "active":
        return email, STATUS_INACTIVE
    if already_enrolled:
        return email, STATUS_ADDED
    return email, None


def parse_roster_csv(raw: bytes) -> list[str]:
    """Return unique roster cells in file order.

    Accepts a header row (``email``, ``student_id``, ``id``) or a headerless
    table with one email per row. Blank cells are skipped. Later duplicates of
    the same email are ignored.
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

    column = 0
    header = [cell.strip().lower().replace(" ", "_") for cell in rows[start]]
    if any(name in HEADER_NAMES for name in header):
        for index, name in enumerate(header):
            if name in HEADER_NAMES:
                column = index
                break
        start += 1

    tokens: list[str] = []
    seen: set[str] = set()
    for row in rows[start:]:
        if column >= len(row):
            continue
        token = row[column].strip()
        key = token.lower()
        if token and key not in seen:
            seen.add(key)
            tokens.append(token)
    return tokens


def build_roster_report(rows: list[tuple[str, str]]) -> str:
    """CSV with ``email`` and ``status`` columns, including when there are no rows."""

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(["email", "status"])
    writer.writerows(rows)
    return buffer.getvalue()


def roster_report_filename(class_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", class_id).strip("._") or "class"
    return f"{safe}-roster-import-result.csv"


@dataclass
class RosterImportOutcome:
    report_csv: str
    filename: str
    enrolled: int
    added: int
    not_found: int
    report_rows: int


def enroll_from_roster(db: Session, class_id: str, raw: bytes, actor_user_id: str) -> RosterImportOutcome:
    """Enroll active students from a roster file into one class.

    Raises ``ValueError`` when the file is empty or has no email cells.
    """

    if not raw:
        raise ValueError("The CSV file is empty.")

    tokens = parse_roster_csv(raw)
    if not tokens:
        raise ValueError("No student emails were found in the CSV.")

    lookup = [token.strip().lower() for token in tokens]
    users = db.query(User).filter(func.lower(User.email).in_(lookup)).all()
    by_email = {user.email.lower(): user for user in users}

    enrolled_ids = {
        row.student_id
        for row in db.query(ClassEnrollment).filter(ClassEnrollment.class_id == class_id).all()
    }

    report_rows: list[tuple[str, str]] = []
    enrolled = added = not_found = 0

    for token in tokens:
        student = by_email.get(token.strip().lower())
        email, outcome = classify_roster_token(
            token,
            user_role=None if student is None else student.role,
            user_status=None if student is None else student.status,
            already_enrolled=student is not None and student.id in enrolled_ids,
        )
        if outcome is not None or student is None:
            if outcome == STATUS_NOT_FOUND:
                not_found += 1
            elif outcome == STATUS_ADDED:
                added += 1
            if outcome is not None:
                report_rows.append((email, outcome))
            continue

        db.add(ClassEnrollment(
            class_id=class_id,
            student_id=student.id,
            role="Member",
            joined_at=datetime.utcnow(),
        ))
        enrolled_ids.add(student.id)
        enrolled += 1

    if enrolled:
        db.add(ActivityLog(
            user_id=actor_user_id,
            action=f"Imported {enrolled} students into class {class_id}",
        ))
        db.commit()

    return RosterImportOutcome(
        report_csv=build_roster_report(report_rows),
        filename=roster_report_filename(class_id),
        enrolled=enrolled,
        added=added,
        not_found=not_found,
        report_rows=len(report_rows),
    )
