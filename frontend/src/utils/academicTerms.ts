/** Class terms offered in the product: 2026 and 2027 only. */
export const CLASS_TERM_YEARS = [2026, 2027] as const;
export const CLASS_DATE_MIN = "2026-01-01";
export const CLASS_DATE_MAX = "2027-12-31";
export const UNASSIGNED_CLASS_DATES = "Unassigned";

export function academicTerms(selected = ""): string[] {
  const terms = CLASS_TERM_YEARS.flatMap((year) =>
    [1, 2, 3].map((semester) => `Semester ${semester}, ${year}`),
  );
  return selected && !terms.includes(selected) ? [selected, ...terms] : terms;
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function inClassDateWindow(day: Date): boolean {
  const min = parseIsoDate(CLASS_DATE_MIN);
  const max = parseIsoDate(CLASS_DATE_MAX);
  return Boolean(min && max && day >= min && day <= max);
}

/** Empty dates are allowed. Assigned dates must both be set, ordered, and in 2026–2027. */
export function classDateError(startDate: string, endDate: string): string | null {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!start && !end) return null;
  if (!start || !end) return "Set both a start date and an end date.";
  const startDay = parseIsoDate(start);
  const endDay = parseIsoDate(end);
  if (!startDay || !endDay) return "Enter a valid start date and end date.";
  if (!inClassDateWindow(startDay) || !inClassDateWindow(endDay)) {
    return "Class dates must fall in 2026 or 2027.";
  }
  if (endDay < startDay) return "End date must be on or after the start date.";
  return null;
}

export function formatClassDateRange(startDate?: string, endDate?: string): string {
  const startDay = startDate ? parseIsoDate(startDate) : null;
  const endDay = endDate ? parseIsoDate(endDate) : null;
  if (!startDay || !endDay) return UNASSIGNED_CLASS_DATES;
  const sharedYear = startDay.getFullYear() === endDay.getFullYear();
  const startLabel = startDay.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: sharedYear ? undefined : "numeric",
  });
  const endLabel = endDay.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}
