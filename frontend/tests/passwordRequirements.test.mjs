import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/utils/passwordRequirements.ts"], bundle: true, write: false,
  format: "esm", platform: "node",
});
const { passwordRequirements } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const checks = (password, policy = "self") => Object.fromEntries(passwordRequirements(password, policy).map(({ key, met }) => [key, met]));

assert.deepEqual(checks(""), { length: false, uppercase: false, lowercase: false, digit: false, symbol: false });
assert.deepEqual(checks("Abcdef1!"), { length: true, uppercase: true, lowercase: true, digit: true, symbol: true });
assert.equal(checks("abcdef1!").uppercase, false);
assert.equal(checks("ABCDEF1!").lowercase, false);
assert.equal(checks("Abcdefg!").digit, false);
assert.equal(checks("Abcdefg1").symbol, false);
assert.equal(checks("Abc1!").length, false);
assert.equal(checks("A1!" + "a".repeat(61)).length, true);
assert.equal(checks("A1!" + "a".repeat(62)).length, false);
assert.deepEqual(checks("password", "admin"), { length: true });
assert.deepEqual(checks("short", "admin"), { length: false });
assert.equal(checks("Abcdef!١").digit, true);
console.log("Password requirement tests passed.");
