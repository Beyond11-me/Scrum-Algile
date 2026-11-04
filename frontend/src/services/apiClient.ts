import { storage } from "./storage";

export class ApiError extends Error {
  fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.fields = fields;
  }
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = storage.get("sql-practice:access-token");
  
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...((options.headers as any) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const baseUrl = import.meta.env.VITE_API_URL || "";
  const fullUrl = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    let errorMsg = "The server could not complete the request.";
    if (typeof data === "string") {
      errorMsg = data;
    } else if (Array.isArray(data?.detail)) {
      errorMsg = data.detail
        .map((e: any) => {
          if (typeof e === "string") return e;
          const loc = Array.isArray(e.loc) ? e.loc.filter((p: any) => p !== "body").join(".") : "";
          const msg = e.msg || e.message || JSON.stringify(e);
          return loc ? `${loc}: ${msg}` : msg;
        })
        .join("; ");
    } else if (data?.detail && typeof data.detail === "object") {
      const fields = Object.fromEntries(
        Object.entries(data.detail).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
      const message = Object.values(fields).join(" ") || "Check the form.";
      throw new ApiError(message, fields);
    } else if (typeof data?.detail === "string") {
      errorMsg = data.detail;
    } else if (data?.message) {
      errorMsg = data.message;
    }
    throw new Error(errorMsg);
  }

  return data as T;
}
