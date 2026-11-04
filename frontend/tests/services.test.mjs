import assert from "node:assert/strict";
import { build } from "esbuild";

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key),
};

const calls = [];
let deferSessionCheck = false;
let pendingSessionCheck = null;

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  const response = (body, status = 200) => ({
    ok: status < 400, status,
    headers: { get: () => "application/json" },
    json: async () => body,
  });
  if (url === "/api/auth/login") return response({ access_token: "signed-token", user: { id: "teacher-1", name: "Teacher", initials: "T", email: "instructor@demo.local", role: "instructor" } });
  if (url === "/api/auth/me") {
    if (deferSessionCheck) return new Promise((resolve, reject) => {
      pendingSessionCheck = { resolve: body => resolve(response(body)), reject };
    });
    return response({ id: "teacher-1", name: "Teacher", initials: "T", email: "instructor@demo.local", role: "instructor" });
  }
  if (url.startsWith("/api/student/dashboard?tz_offset=")) return response({ solved: 1, easy: 1, medium: 0, hard: 0, continuing: [], deadlines: [], currentStreak: 1, submissionsPerDay: [] });
  if (url === "/api/problems") return response([
    { id: "P1", title: "First query", number: "001", topic: "SELECT, WHERE", topics: ["SELECT", "WHERE"], difficulty: "Easy", progress: null, practiceListed: true },
    { id: "P2", title: "Second query", number: "002", topic: "JOIN", topics: ["JOIN"], difficulty: "Hard", progress: null, practiceListed: true },
  ]);
  if (url === "/api/failure") return response({ detail: "Specific server error" }, 400);
  throw new Error(`Unexpected request: ${url}`);
};

const output = await build({
  stdin: {
    contents: "export * from './src/services/authService'; export * from './src/services/studentApi'; export * from './src/services/teacherService'; export * from './src/services/apiClient';",
    resolveDir: process.cwd(), loader: "ts",
  },
  define: {
    "import.meta.env": "{}",
  },
  bundle: true, write: false, format: "esm", platform: "node",
});
const { authService, studentApi, teacherService, apiFetch, TOKEN_KEY, SESSION_KEY } = await import(
  "data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64")
);

const user = await authService.login("instructor@demo.local", "password123");
assert.equal(user.role, "instructor");
assert.equal(memory.get(TOKEN_KEY), "signed-token");
const loginBody = JSON.parse(calls.find(call => call.url === "/api/auth/login").options.body);
assert.equal(loginBody.email, "instructor@demo.local");
assert.equal(loginBody.password, "password123");
assert.equal((await authService.restoreSessionAsync()).id, "teacher-1");

memory.set(SESSION_KEY, JSON.stringify({ id: "legacy-teacher", name: "Lecturer", initials: "L", email: "lecturer@example.edu", role: "lecturer" }));
assert.equal(authService.restoreSession()?.role, "instructor");
memory.set(SESSION_KEY, JSON.stringify({ id: "unknown-role", name: "Unknown", initials: "U", email: "unknown@example.edu", role: "manager" }));
assert.equal(authService.restoreSession(), null);

const dashboard = await studentApi.getDashboard();
assert.equal(dashboard.solved, 1);
assert.deepEqual((await studentApi.getProblems({ progress: "Not started" })).map(item => item.id), ["P1", "P2"]);
assert.deepEqual((await studentApi.getProblems({ topic: "WHERE" })).map(item => item.id), ["P1"]);

const problems = await teacherService.getAllProblems();
assert.equal(problems.length, 2);

console.log("All frontend service tests passed successfully!");
