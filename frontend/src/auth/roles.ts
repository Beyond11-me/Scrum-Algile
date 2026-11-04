/** Roles issued by the backend and used for client-side navigation/UI access. */
export type AppRole = "student" | "instructor" | "admin";

const roleAliases: Record<string, AppRole> = {
  student: "student",
  instructor: "instructor",
  lecturer: "instructor",
  teacher: "instructor",
  admin: "admin",
};

export function normalizeRole(role: unknown): AppRole | null {
  if (typeof role !== "string") return null;
  return roleAliases[role.trim().toLowerCase()] ?? null;
}

export function hasRole(role: unknown, allowedRoles: readonly AppRole[]): boolean {
  const normalizedRole = normalizeRole(role);
  return normalizedRole !== null && allowedRoles.includes(normalizedRole);
}

export function homeForRole(role: unknown): string {
  switch (normalizeRole(role)) {
    case "admin":
      return "/admin/users";
    case "instructor":
      return "/teacher/problems";
    default:
      return "/assignments";
  }
}
