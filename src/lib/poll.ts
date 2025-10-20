// src/lib/poll.ts

export type PollStopper = { stop: () => void; bump: () => void };

type PollOptions<TPayload> = {
  key: string;                  // localStorage key for backoff state
  minMs: number;                // min interval
  maxMs: number;                // max interval
  fetchOnce: (etag: string | null) => Promise<
    | { status: 304; etag: string | null }
    | { status: 200; etag: string | null; payload: TPayload }
  >;
  onChange: (payload: TPayload) => void;
};

/** Primary implementation used by new code */
export function startAdaptivePoll<T>(opts: PollOptions<T>): PollStopper {
  let stopped = false;
  let timer: any = null;
  let etag: string | null = null;

  const stateKey = `poll:${opts.key}`;
  const read = () => {
    try { return JSON.parse(localStorage.getItem(stateKey) || "null") || {}; } catch { return {}; }
  };
  const write = (x: any) => localStorage.setItem(stateKey, JSON.stringify(x));

  let { interval = opts.minMs } = read();

  async function tick(force = false) {
    if (stopped) return;
    try {
      const res = await opts.fetchOnce(etag);
      if (res.status === 200) {
        etag = res.etag || etag;
        opts.onChange((res as any).payload);
        interval = Math.max(opts.minMs, Math.round(interval * 0.6)); // speed up on change
      } else {
        interval = Math.min(opts.maxMs, Math.round(interval * 1.35)); // backoff on 304
      }
    } catch {
      interval = Math.min(opts.maxMs, Math.round(interval * 1.5)); // network error → backoff
    } finally {
      write({ interval });
      if (!stopped) timer = setTimeout(() => tick(), force ? opts.minMs : interval);
    }
  }

  // start immediately
  tick(true);

  return {
    stop() { stopped = true; if (timer) clearTimeout(timer); },
    bump() { if (!stopped) { if (timer) clearTimeout(timer); interval = opts.minMs; tick(true); } },
  };
}

/**
 * Back-compat shim for older imports: startSmartPollETag(url, onChange, opts?)
 * - Uses If-None-Match / ETag
 * - Assumes the endpoint returns JSON on 200
 * - opts: { key?, minMs?, maxMs?, tagHeader? }  tagHeader is rarely needed (we rely on ETag)
 */
export function startSmartPollETag<T = any>(
  url: string,
  onChange: (payload: T) => void,
  opts?: {
    key?: string;
    minMs?: number;
    maxMs?: number;
    tagHeader?: string; // not required; we prefer the standard ETag header
    fetchInit?: RequestInit; // allow callers to pass headers, etc.
  }
): PollStopper {
  const key = opts?.key ?? `url:${url}`;
  const minMs = opts?.minMs ?? 4000;
  const maxMs = opts?.maxMs ?? 60000;

  return startAdaptivePoll<T>({
    key,
    minMs,
    maxMs,
    async fetchOnce(curTag) {
      const headers: Record<string, string> = {};
      if (curTag) headers["If-None-Match"] = curTag;

      const res = await fetch(url, {
        cache: "no-store",
        ...(opts?.fetchInit || {}),
        headers: { ...(opts?.fetchInit?.headers as any), ...headers },
      });

      if (res.status === 304) {
        return { status: 304, etag: curTag ?? null };
      }
      if (!res.ok) {
        // Treat errors like "no change" so we backoff instead of crashing
        return { status: 304, etag: curTag ?? null };
      }

      const payload = (await res.json()) as T;
      const newTag =
        res.headers.get("etag") ||
        (opts?.tagHeader ? res.headers.get(opts.tagHeader) : null) ||
        null;

      return { status: 200, etag: newTag, payload };
    },
    onChange,
  });
}

/** Extra alias for older code paths that imported startSmartPoll */
export const startSmartPoll = startSmartPollETag;
