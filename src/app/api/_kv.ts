// src/app/api/_kv.ts
export const runtime = 'edge';

/**
 * Return a CF Pages/Workers-like `env` object in every environment.
 * Works in: Cloudflare Pages Functions, local dev, preview, and prod.
 */
export function getEnv(): { KAVA_TOURNAMENTS: KVNamespace } {
  const g: any = globalThis as any;

  // Places where bindings may be injected by next-on-pages / workerd
  const guesses = [
    g.__ENV__,
    g.__env,
    g.env,
    // Workerd global (`env` is defined as a global binding)
    (typeof (globalThis as any).env !== 'undefined' ? (globalThis as any).env : undefined),
    // Sometimes bindings are put directly on globalThis
    g,
  ].filter(Boolean);

  // First hit wins
  for (const candidate of guesses) {
    const kv = candidate?.KAVA_TOURNAMENTS;
    if (kv) return { KAVA_TOURNAMENTS: kv };
  }

  // Very explicit error so you can see it in logs
  throw new Error('KV binding KAVA_TOURNAMENTS is not available');
}

// Minimal “type” for TS without importing @cloudflare/workers-types
type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(opts?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  delete(key: string): Promise<void>;
};
