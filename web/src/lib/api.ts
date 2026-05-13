export interface ApiError extends Error {
  status: number;
}

let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!res.ok) throw makeError(res.status, "could not fetch csrf token");
  const data = (await res.json()) as { token: string };
  csrfToken = data.token;
  return csrfToken;
}

export function resetCsrf(): void {
  csrfToken = null;
}

function makeError(status: number, message: string): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
}

type Method = "GET" | "POST" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET") {
    headers["X-CSRF-Token"] = await ensureCsrf();
  }
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `request failed (${res.status})`;
    throw makeError(res.status, message);
  }
  return data as T;
}
