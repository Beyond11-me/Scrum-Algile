import { apiFetch } from "./apiClient";
import type { TeacherClass, TeacherClassMember } from "../data/teacherTypes";

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

  async getAllProblems(): Promise<any[]> {
    return apiFetch("/api/problems");
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
