// functions/api/tournaments/index.ts
type Req = { name: string; hostId: string; code?: string; doc?: any };

function randCode() {
  // 4 or 5 char uppercase; adjust length as you like
  return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

export const onRequestPost: PagesFunction = async ({ env, request }) => {
  const { name, hostId } = (await request.json()) as Req;
  const id = crypto.randomUUID();

  // allocate a unique code
  let code = randCode();
  for (let i = 0; i < 10; i++) {
    const taken = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
    if (!taken) break;
    code = randCode();
  }

  const now = Date.now();
  const doc = {
    id,
    name,
    hostId,
    code,
    createdAt: now,
    status: "setup",
    players: [{ id: hostId, name: "Host" }],
    pending: [],
    queue: [],
    rounds: [] as any[],
  };

  // store tournament and code mapping
  await env.KAVA_TOURNAMENTS.put(`t:${id}`, JSON.stringify(doc));
  await env.KAVA_TOURNAMENTS.put(`code:${code}`, id);

  return new Response(JSON.stringify(doc), { headers: { "content-type": "application/json" } });
};
