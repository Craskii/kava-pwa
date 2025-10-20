// src/app/api/_utils/env.ts
import { getRequestContext } from "@cloudflare/next-on-pages";

export type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list?(input?: any): Promise<any>;
};
export type Env = { KAVA_TOURNAMENTS?: KVNamespace };

export function getEnvOrError(): { env: Required<Env> } | { error: Response } {
  try {
    const { env: rawEnv } = getRequestContext();
    const env = rawEnv as unknown as Env;

    if (!env?.KAVA_TOURNAMENTS || typeof env.KAVA_TOURNAMENTS.get !== "function") {
      return {
        error: new Response(
          JSON.stringify({
            error:
              "KV binding KAVA_TOURNAMENTS missing. Go to Cloudflare Pages → Settings → Functions → KV bindings and add it.",
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        ),
      };
    }

    return { env: { KAVA_TOURNAMENTS: env.KAVA_TOURNAMENTS } };
  } catch (e: any) {
    return {
      error: new Response(JSON.stringify({ error: "getRequestContext failed", detail: String(e?.message || e) }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    };
  }
}
