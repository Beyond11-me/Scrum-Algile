import { apiFetch } from "./apiClient";

export interface AdminUser {
  id?: string;
  name: string;
  email: string;
  role: "Student" | "Lecturer" | "Admin" | string;
  status: "Active" | "Inactive" | string;
  lastActive: string;
  joined: string;
  detail: string;
  password?: string;
  emailDelivery?: "sent" | "failed";
}

export type LecturerOption = {
  id: string;
  name: string;
  email: string;
};

export const adminService = {
  async getUsers(): Promise<AdminUser[]> {
    return apiFetch("/api/admin/users");
  },

  async updateUser(email: string, data: Partial<AdminUser>): Promise<AdminUser> {
    return apiFetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async createUser(data: { name: string; email: string; role: string; password?: string }): Promise<AdminUser> {
    return apiFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async importUsers(file: File): Promise<{ created: number; duplicates: number; invalid: number; reportCsv: string }> {
    const body = new FormData();
    body.append("file", file);
    return apiFetch("/api/admin/users/import", { method: "POST", body });
  },

  async resetPassword(email: string, body: { password?: string; generate?: boolean }): Promise<{ password?: string; message?: string }> {
    return apiFetch(`/api/admin/users/${encodeURIComponent(email)}/reset-password`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async deleteUser(email: string, confirmEmail: string): Promise<{ message: string }> {
    return apiFetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmEmail }),
    });
  },

  async getClasses(): Promise<any[]> {
    return apiFetch("/api/admin/classes");
  },

  async createClass(data: any): Promise<any> {
    return apiFetch("/api/admin/classes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateClass(id: string, data: any): Promise<any> {
    return apiFetch(`/api/admin/classes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async getLecturers(): Promise<LecturerOption[]> {
    return apiFetch("/api/admin/classes/lecturers");
  },

  async getOverviewStats(): Promise<any> {
    return apiFetch("/api/admin/overview/stats");
  },

  async getActivities(): Promise<any[]> {
    return apiFetch("/api/admin/overview/activities");
  },

  async getErrors(): Promise<any[]> {
    return apiFetch("/api/admin/overview/errors");
  }
};
