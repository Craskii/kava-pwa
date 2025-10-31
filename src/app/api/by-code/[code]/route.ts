// src/app/api/by-code/[code]/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};
type Env = { KAVA_TOURNAMENTS: KVNamespace };

function normCode(x: unknown): string {
  const digits = String(x ?? "").replace(/\D+/g, "");
  return digits.slice(-5).padStart(5, "0");
}

const LKEY = (id: string) => `l:${id}`;

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  const { env: rawEnv } = getRequestContext();
  const env = rawEnv as unknown as Env;

  const code = normCode(params.code);
  const mapping = await env.KAVA_TOURNAMENTS.get(`code:${code}`);
  if (!mapping) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let kind: "list" | "tournament" = "list";
  let id = mapping;
  try {
    const parsed = JSON.parse(mapping);
    if (parsed?.id) {
      id = String(parsed.id);
      if (parsed.kind === "tournament") kind = "tournament";
    }
  } catch {}

  if (kind === "list") {
    const exists = !!(await env.KAVA_TOURNAMENTS.get(LKEY(id)));
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const href = kind === "list" ? `/list/${encodeURIComponent(id)}` : `/t/${encodeURIComponent(id)}`;
  return NextResponse.json({ ok: true, kind, id, href, code });
}
