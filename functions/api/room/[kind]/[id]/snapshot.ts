// Pages Function: HTTP snapshot proxy to DO
export const onRequest: PagesFunction = async ({ env, params, request }) => {
  const kind = String(params.kind);
  const id = String(params.id);

  const bindingName =
    kind === 'tournament' ? 'TOURNAMENT_ROOM' : 'LIST_ROOM';

  const ns: DurableObjectNamespace = (env as any)[bindingName];
  if (!ns) return new Response(`Missing DO binding: ${bindingName}`, { status: 500 });

  const stub = ns.get(ns.idFromName(id));

  const url = new URL(request.url);
  url.pathname = '/snapshot';
  const forward = new Request(url.toString(), { headers: request.headers });

  return stub.fetch(forward);
};
