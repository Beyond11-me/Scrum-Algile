import { apiFetch } from "./apiClient";

export interface AdminClass {
  id: string;
  course: string;
  term: string;
  instructor_id?: string | null;
  instructor_name?: string | null;
  students: number;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
}

export interface LecturerOption {
  id: string;
  name: string;
  email: string;
}

export interface ClassCreateInput {
  id: string;
  course: string;
  term: string;
  instructor_id?: string;
  start_date?: string;
  end_date?: string;
}

export const adminService = {
  async getClasses(): Promise<AdminClass[]> {
    return apiFetch("/api/admin/classes");
  },

  async getLecturers(): Promise<LecturerOption[]> {
    return apiFetch("/api/admin/classes/lecturers");
  },

  async createClass(data: ClassCreateInput): Promise<AdminClass> {
    return apiFetch("/api/admin/classes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async deleteClass(id: string): Promise<void> {
    return apiFetch(`/api/admin/classes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
