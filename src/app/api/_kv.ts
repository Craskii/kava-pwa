// src/app/api/_kv.ts
export const runtime = 'edge';

// Look for bindings across all places next-on-pages has used
export function getEnv(): { KAVA_TOURNAMENTS?: KVNamespace } {
  const g: any = globalThis as any;

  const candidates = [
    g?.ENV,         // common
    g?.env,         // lowercased
    g?.__ENV__,     // older
    g?.__env__,     // older/lowercase
    g               // sometimes hoisted onto globalThis
  ];

  for (const c of candidates) {
    if (c?.KAVA_TOURNAMENTS) return { KAVA_TOURNAMENTS: c.KAVA_TOURNAMENTS };
  }
  return {};
}
