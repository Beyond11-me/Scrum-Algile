import { apiFetch } from "./apiClient";
import { storage } from "./storage";
import type { Assignment, Deadline } from "../data/models";
import { localDate, localTime, parseServerDateTime } from "../utils/serverDateTime";

export interface StudentAssignments {
  classes: { id: string; code: string; name: string; lecturer: string }[];
  assignments: Assignment[];
  deadlines: Deadline[];
  problems: { id: string; title: string; topic: string; difficulty: string }[];
}

function localizeSchedule<T extends { date: string; time: string }>(item: T): T {
  if (!item.date || !item.time) return item;
  const timestamp = `${item.date}T${item.time}:00`;
  return { ...item, date: localDate(timestamp), time: localTime(timestamp) };
}

export type ProblemFilters = {
  includeTrending?: boolean;
  search?: string;
  topic?: string;
  difficulty?: string;
  progress?: string;
  includePrivate?: boolean;
};

export type QueryResult = {
  status: string;
  message: string;
  table?: any;
  expected?: any;
};

export interface DailySubmission {
  date: string;
  count: number;
}

export interface DashboardStats {
  solved: number;
  easy: number;
  medium: number;
  hard: number;
  continuing: any[];
  deadlines: any[];
  currentStreak: number;
  longestStreak: number;
  submissionsPerDay: DailySubmission[];
  deadlinesError?: string;
}

export const studentApi = {
  getDashboard: async (): Promise<DashboardStats> => {
    const tzOffset = new Date().getTimezoneOffset();
    try {
      const dashboard = (await apiFetch(`/api/student/dashboard?tz_offset=${tzOffset}`)) as DashboardStats;
      return { ...dashboard, deadlines: [] };
    } catch {
      return {
        solved: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        continuing: [],
        deadlines: [],
        currentStreak: 0,
        longestStreak: 0,
        submissionsPerDay: [],
      };
    }
  },

  getProblems: async (f: ProblemFilters = {}) => {
    const url = "/api/problems";
    const problems: any[] = (await apiFetch(url)).map((problem: any) => ({
      ...problem,
      progress: problem.progress || "Not started",
    }));
    
    return problems.filter(
      (p) =>
        (f.includePrivate ? true : p.practiceListed === true) &&
        (!f.search || `${p.title} ${p.number}`.toLowerCase().includes(f.search.toLowerCase())) &&
        (!f.topic || (p.topics && (p.topics as string[]).includes(f.topic))) &&
        (!f.difficulty || p.difficulty === f.difficulty) &&
        (!f.progress || p.progress === f.progress)
    );
  },

  getProblem: async (id: string, context?: string) => {
    const qs = context ? `?context=${encodeURIComponent(context)}` : "";
    return await apiFetch(`/api/problems/${id}${qs}`);
  },

  getAssignments: async (): Promise<StudentAssignments> => {
    try {
      const enrolled = (await apiFetch("/api/student/assignments")) as StudentAssignments;
      return {
        ...enrolled,
        assignments: (enrolled.assignments || []).filter((item: any) => !item.isContest).map(localizeSchedule),
        deadlines: (enrolled.deadlines || []).map(localizeSchedule),
      };
    } catch {
      return { classes: [], assignments: [], deadlines: [], problems: [] };
    }
  },

  runQuery: async (id: string, query: string, database: string, source = "Practice", context = "Practice"): Promise<QueryResult> => {
    return await apiFetch(`/api/problems/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ query, database, source, context }),
    });
  },

  submitSolution: async (
    id: string,
    query: string,
    database: string,
    source: string = "Practice",
    context: string = "Practice"
  ): Promise<QueryResult> => {
    return await apiFetch(`/api/problems/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ query, database, source, context }),
    });
  },

  getHint: async (id: string, context?: string) => {
    const problem = await apiFetch(`/api/problems/${id}${context ? `?context=${encodeURIComponent(context)}` : ""}`);
    return problem.hint || "Không có gợi ý cho bài tập này.";
  },

  askAi: async (problemContext: any, codeDraft: string, userMessage: string, sessionId?: string) => {
    return await apiFetch("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        problemContext,
        codeDraft,
        userMessage,
        sessionId,
      }),
    });
  },

  getAiChatSessions: async (problemId: string) => {
    return await apiFetch(`/api/ai/sessions/${problemId}`);
  },

  getAiChatMessages: async (sessionId: string) => {
    return await apiFetch(`/api/ai/sessions/messages/${sessionId}`);
  },

  getDraft: (id: string) => {
    let prefix = "";
    try {
      const sessionStr = storage.get("sql-practice:session:v1");
      if (sessionStr) {
        const user = JSON.parse(sessionStr);
        if (user && user.id) prefix = user.id + ":";
      }
    } catch {}
    
    return storage.get(`sql-practice:draft:${prefix}${id}`);
  },

  saveDraft: (id: string, query: string) => {
    let prefix = "";
    try {
      const sessionStr = storage.get("sql-practice:session:v1");
      if (sessionStr) {
        const user = JSON.parse(sessionStr);
        if (user && user.id) prefix = user.id + ":";
      }
    } catch {}
    
    storage.set(`sql-practice:draft:${prefix}${id}`, query);
  },

  getPreferences: async () => {
    return await apiFetch("/api/student/preferences");
  },

  toggleFavorite: async (problemId: string) => {
    return await apiFetch(`/api/student/preferences/favorites/${problemId}`, {
      method: "POST"
    });
  },

  createList: async (name: string, problemIds: string[]) => {
    return await apiFetch("/api/student/preferences/lists", {
      method: "POST",
      body: JSON.stringify({ name, problemIds })
    });
  },

  getTrending: async (range: string) => {
    return await apiFetch(`/api/problems/trending?range=${encodeURIComponent(range)}`);
  },

  getSubmissions: async (filters: { search?: string; result?: string; source?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.append("search", filters.search);
    if (filters.result) params.append("result", filters.result);
    if (filters.source) params.append("source", filters.source);
    
    const qs = params.toString();
    const url = qs ? `/api/submissions?${qs}` : "/api/submissions";
    
    return await apiFetch(url);
  },

  getNotifications: async () => {
    return await apiFetch("/api/notifications");
  },
  
  getUnreadCount: async () => {
    return await apiFetch("/api/notifications/unread-count");
  },
  
  markAsRead: async (id: string) => {
    return await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" });
  },
  
  markAllAsRead: async () => {
    return await apiFetch("/api/notifications/read-all", { method: "PUT" });
  }
};
