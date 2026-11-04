from datetime import date, datetime
from typing import Optional

ALLOWED_TERM_YEARS = (2026, 2027)
ALLOWED_TERMS = tuple(
    f"Semester {semester}, {year}"
    for year in ALLOWED_TERM_YEARS
    for semester in (1, 2, 3)
)
CLASS_DATE_MIN = date(2026, 1, 1)
CLASS_DATE_MAX = date(2027, 12, 31)
UNASSIGNED_DATES = "Unassigned"
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def parse_class_date(raw: Optional[str]) -> Optional[date]:
    value = blank_to_none(raw)
    if not value:
        return None
    try:
        parsed = datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("Enter a valid start date and end date.") from None
    if parsed < CLASS_DATE_MIN or parsed > CLASS_DATE_MAX:
        raise ValueError("Class dates must fall in 2026 or 2027.")
    return parsed


def class_date_error(start_raw: Optional[str], end_raw: Optional[str]) -> Optional[str]:
    start_text = blank_to_none(start_raw)
    end_text = blank_to_none(end_raw)
    if not start_text and not end_text:
        return None
    if not start_text or not end_text:
        return "Set both a start date and an end date."
    try:
        start_day = parse_class_date(start_text)
        end_day = parse_class_date(end_text)
    except ValueError as error:
        return str(error)
    if start_day and end_day and end_day < start_day:
        return "End date must be on or after the start date."
    return None


def class_term_error(term: Optional[str], current: Optional[str] = None) -> Optional[str]:
    value = blank_to_none(term)
    if not value:
        return "Choose a term in 2026 or 2027."
    if value in ALLOWED_TERMS:
        return None
    # Keep a stored legacy term so older classes can still be edited.
    if current and value == current:
        return None
    return "Choose a term in 2026 or 2027."


def format_class_dates(start_raw: Optional[str], end_raw: Optional[str]) -> str:
    start_text = blank_to_none(start_raw)
    end_text = blank_to_none(end_raw)
    if not start_text or not end_text:
        return UNASSIGNED_DATES
    try:
        start_day = datetime.strptime(start_text[:10], "%Y-%m-%d")
        end_day = datetime.strptime(end_text[:10], "%Y-%m-%d")
    except ValueError:
        return f"{start_text} – {end_text}"

    def label(day: datetime, with_year: bool) -> str:
        core = f"{_MONTHS[day.month - 1]} {day.day:02d}"
        return f"{core}, {day.year}" if with_year else core

    if start_day.year == end_day.year:
        return f"{label(start_day, False)} – {label(end_day, True)}"
    return f"{label(start_day, True)} – {label(end_day, True)}"
