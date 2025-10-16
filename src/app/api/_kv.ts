// src/app/api/_kv.ts
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

/* Minimal KV types */
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list?(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    cursor?: string;
    list_complete?: boolean;
  }>;
};

/* Match your CF binding name exactly */
export type Env = { KAVA_TOURNAMENTS: KVNamespace };

/** Returns the Cloudflare Env with your KV bound */
export function getEnv(): Env {
  const { env } = getRequestContext();
  return env as unknown as Env;
}
