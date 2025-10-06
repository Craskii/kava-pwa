export function getDeviceId(): string {
  if (typeof localStorage === "undefined") return "unknown";
  const k = "device_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
}
