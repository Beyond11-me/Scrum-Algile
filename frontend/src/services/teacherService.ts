import { apiFetch } from "./apiClient";
import { storage } from "./storage";
import type { TeacherClass, TeacherClassMember } from "../data/teacherTypes";

export type RosterImportResult = {
  enrolled: number;
  added: number;
  notFound: number;
  reportRows: number;
  reportCsv: string;
  filename: string;
};

function rosterHeaderCount(response: Response, name: string): number {
  const value = Number(response.headers.get(name) || 0);
  return Number.isFinite(value) ? value : 0;
}

export interface ClassCreate {
  id: string;
  course: string;
  term: string;
  startDate?: string;
  endDate?: string;
}

export interface ClassMemberAdd {
  student_id: string;
}

export interface TeacherSubmissionItem {
  id: string;
  student: string;
  studentEmail?: string;
  problemId: string;
  problemNumber?: string;
  problemTitle: string;
  autoScore: number;
  finalScore?: number | null;
  status: string;
  result: string;
  submittedAt: string;
  query?: string;
  feedback?: string;
  source?: string;
}

export const teacherService = {
  async getClasses(): Promise<TeacherClass[]> {
    return apiFetch("/api/teacher/classes");
  },

  async getAllStudents(): Promise<TeacherClassMember[]> {
    return apiFetch("/api/teacher/classes/students");
  },

  async createClass(data: ClassCreate): Promise<TeacherClass> {
    return apiFetch("/api/teacher/classes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getClassMembers(classId: string): Promise<TeacherClassMember[]> {
    return apiFetch(`/api/teacher/classes/${encodeURIComponent(classId)}/members`);
  },

  async addClassMember(classId: string, data: ClassMemberAdd): Promise<TeacherClassMember> {
    return apiFetch(`/api/teacher/classes/${encodeURIComponent(classId)}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async removeClassMember(classId: string, studentId: string): Promise<void> {
    return apiFetch(`/api/teacher/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(studentId)}`, {
      method: "DELETE",
    });
  },

  async getAllProblems(includeArchived = false): Promise<any[]> {
    return apiFetch(`/api/problems${includeArchived ? "?include_archived=true" : ""}`);
  },

  async importClassMembers(classId: string, file: File): Promise<RosterImportResult> {
    const token = storage.get("sql-practice:access-token");
    const body = new FormData();
    body.append("file", file);
    const baseUrl = import.meta.env.VITE_API_URL || "";
    const response = await fetch(`${baseUrl}/api/teacher/classes/${encodeURIComponent(classId)}/members/import`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    if (!response.ok) {
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await response.json() : await response.text();
      const message = typeof data === "string" ? data : data?.detail || "Could not import the CSV roster.";
      throw new Error(typeof message === "string" ? message : "Could not import the CSV roster.");
    }

    const reportCsv = await response.text();
    const disposition = response.headers.get("Content-Disposition") || "";
    const named = disposition.match(/filename="([^"]+)"/);
    return {
      enrolled: rosterHeaderCount(response, "X-Roster-Enrolled"),
      added: rosterHeaderCount(response, "X-Roster-Added"),
      notFound: rosterHeaderCount(response, "X-Roster-Not-Found"),
      reportRows: rosterHeaderCount(response, "X-Roster-Report-Rows"),
      reportCsv,
      filename: named?.[1] || `${classId}-roster-import-result.csv`,
    };
  },

  async getProblem(id: string): Promise<any> {
    return apiFetch(`/api/problems/${encodeURIComponent(id)}`);
  },

  async createProblem(data: any): Promise<any> {
    return apiFetch("/api/problems", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateProblem(id: string, data: any): Promise<any> {
    return apiFetch(`/api/problems/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteProblem(id: string): Promise<any> {
    return apiFetch(`/api/problems/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async restoreProblem(id: string): Promise<any> {
    return apiFetch(`/api/problems/${encodeURIComponent(id)}/restore`, { method: "POST" });
  },

  async validateSolution(data: any): Promise<any> {
    return apiFetch("/api/problems/validate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getAssignments(): Promise<any[]> {
    return apiFetch("/api/assignments");
  },

  async getAudienceCount(audienceType: "classes" | "all_students", classIds: string[]): Promise<{ eligibleStudents: number }> {
    const params = new URLSearchParams({ audience_type: audienceType });
    classIds.forEach((id) => params.append("class_ids", id));
    return apiFetch(`/api/assignments/audience-count?${params.toString()}`);
  },

  async getAssignment(id: string): Promise<any> {
    return apiFetch(`/api/assignments/${encodeURIComponent(id)}`);
  },

  async createAssignment(data: any): Promise<any> {
    return apiFetch("/api/assignments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateAssignment(id: string, data: any): Promise<any> {
    return apiFetch(`/api/assignments/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteAssignment(id: string): Promise<any> {
    return apiFetch(`/api/assignments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async getTeacherSubmissions(): Promise<TeacherSubmissionItem[]> {
    return apiFetch("/api/submissions/teacher/all");
  },

  async getSubmission(id: string): Promise<any> {
    return apiFetch(`/api/submissions/${encodeURIComponent(id)}`);
  },

  async updateSubmissionReview(id: string, finalScore: number, feedback: string): Promise<any> {
    return apiFetch(`/api/submissions/${encodeURIComponent(id)}/review`, {
      method: "PUT",
      body: JSON.stringify({ finalScore, feedback }),
    });
  },

  async getAssignmentSubmissions(assignmentId: string): Promise<any[]> {
    return apiFetch(`/api/assignments/${encodeURIComponent(assignmentId)}/submissions`);
  },
};
