export async function publishToRoom(kind: 'list'|'tournament', id: string, payload: any, init?: RequestInit) {
  const res = await fetch(`/api/room/${kind}/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
    ...init,
  });
  return res.ok;
}
