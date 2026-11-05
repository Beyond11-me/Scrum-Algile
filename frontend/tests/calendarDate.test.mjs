import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/utils/calendarDate.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { dateKey, parseDateKey, calendarDays } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));

assert.equal(dateKey(new Date(2026, 10, 5, 23, 45)), "2026-11-05");
assert.equal(dateKey(parseDateKey("2024-02-29")), "2024-02-29");
assert.equal(parseDateKey("2026-02-29"), null);
assert.equal(parseDateKey("2026-13-01"), null);
assert.equal(parseDateKey("2026-04-31"), null);
const leapFebruary = calendarDays(2024, 1);
assert.equal(leapFebruary.indexOf("2024-02-01"), 3); // Thursday in a Monday-first week
assert.equal(leapFebruary.filter(Boolean).length, 29);
assert.equal(leapFebruary.at(-1), "2024-02-29");
assert.equal(calendarDays(2026, 11).at(-1), "2026-12-31");
console.log("Calendar date tests passed.");
