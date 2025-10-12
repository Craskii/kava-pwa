// src/app/api/_kv.ts
export type Env = {
  KAVA_TOURNAMENTS: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
      keys: { name: string }[];
      list_complete: boolean;
      cursor?: string;
    }>;
  };
};

// Cloudflare Pages/Functions injects bindings into globalThis
export function getEnv(): Env {
  // @ts-ignore
  const env: Env = (globalThis as any)?.__env__ || (globalThis as any);
  if (!env?.KAVA_TOURNAMENTS) {
    throw new Error('KV binding KAVA_TOURNAMENTS is not available');
  }
  return env;
}
