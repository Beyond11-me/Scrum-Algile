import { storage } from "./storage";
import { apiFetch } from "./apiClient";
import { normalizeRole, type AppRole } from "../auth/roles";

export type StudentSession = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: AppRole;
};

export const SESSION_KEY = "sql-practice:session:v1";
export const TOKEN_KEY = "sql-practice:access-token";
let sessionVersion = 0;

export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function persist(user: StudentSession, token: string) {
  const normalizedUser = normalizeSession(user);
  if (!normalizedUser) throw new Error("The server returned an invalid account role.");
  sessionVersion += 1;
  storage.set(SESSION_KEY, JSON.stringify(normalizedUser));
  storage.set(TOKEN_KEY, token);
  return normalizedUser;
}

function normalizeSession(value: unknown): StudentSession | null {
  if (!value || typeof value !== "object") return null;
  const user = value as Partial<StudentSession>;
  const role = normalizeRole(user.role);
  if (!role || !user.id || !user.name || !user.initials || !user.email) return null;
  return { id: user.id, name: user.name, initials: user.initials, email: user.email, role };
}

export const authService = {
  async login(email: string, password: string) {
    if (!validEmail(email) || !password.trim())
      throw new Error("Enter a valid email and a password.");
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return persist(data.user, data.access_token);
  },
  
  async demoLogin() {
    const data = await apiFetch("/api/auth/demo", { method: "POST" });
    return persist(data.user, data.access_token);
  },
  
  async getProfile(): Promise<StudentSession & { nextProfileChangeAt: string | null }> {
    return apiFetch("/api/auth/profile");
  },

  async updateProfile(body: { name?: string; currentPassword?: string; newPassword?: string }) {
    const data = await apiFetch("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const token = storage.get(TOKEN_KEY);
    if (!token) throw new Error("Sign in again before changing your account.");
    return persist(data, token);
  },

  logout() {
    sessionVersion += 1;
    storage.remove(SESSION_KEY);
    storage.remove(TOKEN_KEY);
  },
  
  async restoreSessionAsync(): Promise<StudentSession | null> {
    const token = storage.get(TOKEN_KEY);
    if (!token) {
      storage.remove(SESSION_KEY);
      return null;
    }
    const version = sessionVersion;
    try {
      const user = await apiFetch("/api/auth/me");
      if (sessionVersion !== version || storage.get(TOKEN_KEY) !== token) return null;
      const restoredUser = normalizeSession(user);
      if (!restoredUser) {
        authService.logout();
        return null;
      }
      storage.set(SESSION_KEY, JSON.stringify(restoredUser));
      return restoredUser;
    } catch {
      if (sessionVersion === version && storage.get(TOKEN_KEY) === token) authService.logout();
      return null;
    }
  },
  
  restoreSession(): StudentSession | null {
    try {
      const value = JSON.parse(storage.get(SESSION_KEY) || "null");
      return normalizeSession(value);
    } catch {
      /* Ignore malformed sessions. */
    }
    return null;
  }
};
