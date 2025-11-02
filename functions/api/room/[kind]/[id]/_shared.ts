// Small helper all three routes use.

export type Kind = "list" | "tournament";

export function getRoomNamespace(env: any, kind: string) {
  const k = (kind || "").toLowerCase();
  if (k === "list") return env.LIST_ROOM;
  if (k === "tournament") return env.TOURNAMENT_ROOM;
  throw new Response("unknown room kind", { status: 400 });
}

export function requireId(params: Record<string,string|undefined>) {
  const id = params["id"];
  if (!id) throw new Response("missing id", { status: 400 });
  return id;
}
