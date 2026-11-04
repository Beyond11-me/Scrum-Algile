import type { RosterImportResult } from "../services/teacherService";

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadRosterTemplate() {
  downloadCsv("class-roster-template.csv", "email\r\n21520001@gm.uit.edu.vn\r\n");
}

export function rosterImportNotice(result: RosterImportResult): string {
  const parts = [`${result.enrolled} added to the class`];
  if (result.added) parts.push(`${result.added} already added`);
  if (result.notFound) parts.push(`${result.notFound} not found`);
  if (result.reportRows) parts.push("result file downloaded");
  return parts.join(" · ");
}
