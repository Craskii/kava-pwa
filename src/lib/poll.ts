// src/lib/poll.ts

export type PollStopper = { stop: () => void; bump: () => void };

type PollOptions<TPayload> = {
  key: string; // a logical key to keep per-poll backoff state
  minMs: number;
  maxMs: number;
  fetchOnce: (
    etag: string | null
  ) => Promise<
    | { status: 304; etag: string | null }
    | { status: 200; etag: string | null; payload: TPayload }
  >;
  onChange: (payload: TPayload) => void;
};

// Safe helpers for optional localStorage
function lsGetJSON<T = any>(key: string): T | null {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return null;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function lsSetJSON(key: string, value: any) {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Primary implementation used by new code */
export function startAdaptivePoll<T>(opts: PollOptions<T>): PollStopper {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let etag: string | null = null;

  const stateKey = `poll:${opts.key}`;
  const prev = lsGetJSON<{ interval?: number }>(stateKey) || {};
  let interval = prev.interval ?? opts.minMs;

  async function tick(force = false) {
    if (stopped) return;
    try {
      const res = await opts.fetchOnce(etag);
      if (res.status === 200) {
        etag = res.etag || etag;
        opts.onChange((res as any).payload as T);
        // speed up on change
        interval = Math.max(opts.minMs, Math.round(interval * 0.6));
      } else {
        // gentle backoff on 304
        interval = Math.min(opts.maxMs, Math.round(interval * 1.35));
      }
    } catch {
      // stronger backoff on network error
      interval = Math.min(opts.maxMs, Math.round(interval * 1.5));
    } finally {
      lsSetJSON(stateKey, { interval });
      if (!stopped) {
        timer = setTimeout(() => tick(), force ? opts.minMs : interval);
      }
    }
  }

  // start shortly after mount
  timer = setTimeout(() => tick(true), 50);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    bump() {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      interval = opts.minMs;
      tick(true);
    },
  };
}

/**
 * Back-compat + flexible signature:
 *
 * 1) Classic:
 *    startSmartPollETag(url, onChange, { key?, minMs?, maxMs?, tagHeader?, fetchInit? })
 *
 * 2) Newer object form (what some pages use now):
 *    startSmartPollETag(url, { onUpdate, key?, minMs?, maxMs?, versionHeader?, fetchInit? })
 */
export function startSmartPollETag<T = any>(
  url: string,
  arg2:
    | ((payload: T) => void)
    | {
        onUpdate: (payload: T) => void;
        key?: string;
        minMs?: number;
        maxMs?: number;
        versionHeader?: string; // alias of tagHeader
        fetchInit?: RequestInit;
      },
  arg3?: {
    key?: string;
    minMs?: number;
    maxMs?: number;
    tagHeader?: string;
    fetchInit?: RequestInit;
  }
): PollStopper {
  // Normalize arguments
  const isFn = typeof arg2 === 'function';
  const onChange: (payload: T) => void = isFn ? (arg2 as any) : (arg2 as any).onUpdate;

  const key =
    (isFn ? arg3?.key : (arg2 as any).key) ?? `url:${url}`;
  const minMs =
    (isFn ? arg3?.minMs : (arg2 as any).minMs) ?? 4000;
  const maxMs =
    (isFn ? arg3?.maxMs : (arg2 as any).maxMs) ?? 60000;

  const tagHeader =
    (isFn ? arg3?.tagHeader : (arg2 as any).versionHeader) ?? // prefer versionHeader name if given
    (isFn ? arg3?.tagHeader : undefined);

  const fetchInit: RequestInit | undefined = (isFn ? arg3?.fetchInit : (arg2 as any).fetchInit) ?? undefined;

  return startAdaptivePoll<T>({
    key,
    minMs,
    maxMs,
    async fetchOnce(curTag) {
      const headers: Record<string, string> = {};
      if (curTag) headers['If-None-Match'] = curTag;

      const res = await fetch(url, {
        cache: 'no-store',
        ...(fetchInit || {}),
        headers: { ...(fetchInit?.headers as any), ...headers },
      });

      if (res.status === 304) {
        return { status: 304, etag: curTag ?? null };
      }
      if (!res.ok) {
        // Treat errors like no-change so we back off instead of crashing
        return { status: 304, etag: curTag ?? null };
      }

      const payload = (await res.json()) as T;

      // Prefer real ETag. Fall back to custom version header if present.
      const newTag = res.headers.get('etag') || (tagHeader ? res.headers.get(tagHeader) : null) || null;

      return { status: 200, etag: newTag, payload };
    },
    onChange,
  });
}

/** Extra alias for any old imports that used startSmartPoll */
export const startSmartPoll = startSmartPollETag;
