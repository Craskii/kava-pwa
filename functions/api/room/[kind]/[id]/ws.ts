// Pages Function: WS pass-through to Durable Object
export const onRequest: PagesFunction = async ({ env, params, request }) => {
  const kind = String(params.kind);
  const id = String(params.id);

  const bindingName =
    kind === 'tournament' ? 'TOURNAMENT_ROOM' : 'LIST_ROOM';

  const ns: DurableObjectNamespace = (env as any)[bindingName];
  if (!ns) return new Response(`Missing DO binding: ${bindingName}`, { status: 500 });

  const stub = ns.get(ns.idFromName(id));

  // Forward the upgrade to the DO at its /ws endpoint
  const url = new URL(request.url);
  url.pathname = '/ws';
  const forward = new Request(url.toString(), request);

  return stub.fetch(forward);
};
