export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
