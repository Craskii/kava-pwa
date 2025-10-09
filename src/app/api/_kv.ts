// src/app/api/_kv.ts
import { getRequestContext } from "@cloudflare/next-on-pages";

export type Env = {
  KAVA_TOURNAMENTS: KVNamespace;
};

// Cloudflare's global KV type (kept minimal here)
export type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(input?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    cursor?: string;
    list_complete?: boolean;
  }>;
};

export function getEnv(): Env {
  const { env } = getRequestContext<{ env: Env }>();
  return env;
}
