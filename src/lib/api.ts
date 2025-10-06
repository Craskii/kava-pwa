export const API_BASE =
  typeof window === "undefined"
    ? "" // SSR – relative
    : window.location.origin;

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { credentials: "omit" });
  return r.json();
}
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
  });
  return r.json();
}
export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
  });
  return r.json();
}
export async function apiDelete(path: string): Promise<void> {
  await fetch(`${API_BASE}${path}`, { method: "DELETE", credentials: "omit" });
}
