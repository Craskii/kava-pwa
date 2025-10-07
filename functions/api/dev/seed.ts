// functions/api/dev/seed.ts
export const onRequestGet: PagesFunction = async ({ env }) => {
  const kv = env.KAVA_TOURNAMENTS as { put: (k: string, v: string) => Promise<void> };
  await kv.put("code:1234", "abc123");
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
