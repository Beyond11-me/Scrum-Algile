import assert from "node:assert/strict";
import { build } from "esbuild";

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key),
};

const output = await build({
  stdin: {
    contents: [
      "export * from './src/utils/academicTerms';",
      "export { rosterImportNotice, downloadRosterTemplate } from './src/utils/rosterCsv';",
      "export { teacherService } from './src/services/teacherService';",
    ].join("\n"),
    resolveDir: process.cwd(),
    loader: "ts",
  },
  define: { "import.meta.env": "{}" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const {
  academicTerms,
  classDateError,
  formatClassDateRange,
  rosterImportNotice,
  downloadRosterTemplate,
  teacherService,
} = await import("data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64"));

const terms = academicTerms();
assert.equal(terms.length, 6);
assert.ok(terms.includes("Semester 1, 2026"));
assert.ok(terms.includes("Semester 3, 2027"));
assert.equal(academicTerms("Semester 2, 2030")[0], "Semester 2, 2030");
assert.equal(academicTerms("Semester 1, 2026")[0], "Semester 1, 2026");

assert.equal(classDateError("", "  "), null);
assert.equal(classDateError("2026-09-07", ""), "Set both a start date and an end date.");
assert.equal(classDateError("9999-01-01", "9999-12-31"), "Class dates must fall in 2026 or 2027.");
assert.equal(classDateError("2026-11-28", "2026-09-07"), "End date must be on or after the start date.");
assert.equal(classDateError("2026-02-31", "2026-03-01"), "Enter a valid start date and end date.");
assert.equal(classDateError("2026-09-07", "2026-11-28"), null);
assert.equal(formatClassDateRange(), "Unassigned");
assert.equal(formatClassDateRange("2026-09-07", "2026-11-28"), "Sep 07 – Nov 28, 2026");
assert.equal(formatClassDateRange("2026-12-20", "2027-01-10"), "Dec 20, 2026 – Jan 10, 2027");

assert.equal(rosterImportNotice({
  enrolled: 2, added: 0, notFound: 0, reportRows: 0, reportCsv: "", filename: "x.csv",
}), "2 added to the class");
assert.equal(rosterImportNotice({
  enrolled: 1, added: 2, notFound: 3, reportRows: 5, reportCsv: "email,status", filename: "x.csv",
}), "1 added to the class · 2 already added · 3 not found · result file downloaded");

const blobs = [];
globalThis.Blob = class {
  constructor(parts) { this.parts = parts; blobs.push(this); }
};
const downloads = [];
globalThis.URL.createObjectURL = () => "blob:roster";
globalThis.URL.revokeObjectURL = () => {};
globalThis.document = {
  createElement: () => ({ click() { downloads.push(this.download); } }),
};
downloadRosterTemplate();
assert.equal(downloads[0], "class-roster-template.csv");
assert.equal(blobs[0].parts[0], "email\r\n21520001@gm.uit.edu.vn\r\n");

memory.set("sql-practice:access-token", "signed-token");
globalThis.fetch = async (url, options) => {
  assert.equal(url, "/api/teacher/classes/IS201.R11/members/import");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer signed-token");
  return {
    ok: true,
    headers: { get: name => ({
      "X-Roster-Enrolled": "1",
      "X-Roster-Added": "1",
      "X-Roster-Not-Found": "1",
      "X-Roster-Report-Rows": "2",
      "Content-Disposition": 'attachment; filename="IS201.R11-roster-import-result.csv"',
    })[name] ?? null },
    text: async () => "email,status\r\n21520009@gm.uit.edu.vn,not found\r\n",
  };
};
const imported = await teacherService.importClassMembers("IS201.R11", { name: "roster.csv" });
assert.equal(imported.enrolled, 1);
assert.equal(imported.added, 1);
assert.equal(imported.notFound, 1);
assert.equal(imported.reportRows, 2);
assert.equal(imported.filename, "IS201.R11-roster-import-result.csv");
assert.match(imported.reportCsv, /not found/);

globalThis.fetch = async () => ({
  ok: false,
  headers: { get: () => "application/json" },
  json: async () => ({ detail: "No student emails were found in the CSV." }),
  text: async () => "",
});
await assert.rejects(
  () => teacherService.importClassMembers("IS201.R11", { name: "empty.csv" }),
  /No student emails were found in the CSV/,
);

console.log("Class schedule and roster import tests passed.");
