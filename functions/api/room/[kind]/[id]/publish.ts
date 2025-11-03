// Pages Function: POST publish to DO (fan-out)
export const onRequest: PagesFunction = async ({ env, params, request }) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const kind = String(params.kind);
  const id = String(params.id);

  const bindingName =
    kind === 'tournament' ? 'TOURNAMENT_ROOM' : 'LIST_ROOM';

  const ns: DurableObjectNamespace = (env as any)[bindingName];
  if (!ns) return new Response(`Missing DO binding: ${bindingName}`, { status: 500 });

  const stub = ns.get(ns.idFromName(id));

  const url = new URL(request.url);
  url.pathname = '/publish';

  // Pass the original body through
  const forward = new Request(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body: await request.arrayBuffer(),
  });

  return stub.fetch(forward);
};
