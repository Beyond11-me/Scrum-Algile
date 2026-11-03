import { storage } from "./storage";

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
    } else if (typeof data?.detail === "string") {
      errorMsg = data.detail;
    } else if (data?.message) {
      errorMsg = data.message;
    }
    throw new Error(errorMsg);
  }

  return data as T;
}
