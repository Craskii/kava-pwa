// src/lib/poll.ts

export type PollStopper = { stop: () => void; bump: () => void };

type PollOptions<TPayload> = {
  key: string;
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

// Safe localStorage helpers (SSR-friendly)
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
  } catch {}
}

/** Primary adaptive poller */
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
        interval = Math.max(opts.minMs, Math.round(interval * 0.6)); // faster after change
      } else {
        interval = Math.min(opts.maxMs, Math.round(interval * 1.35)); // backoff on 304
      }
    } catch {
      interval = Math.min(opts.maxMs, Math.round(interval * 1.5)); // stronger backoff on error
    } finally {
      lsSetJSON(stateKey, { interval });
      if (!stopped) timer = setTimeout(() => tick(), force ? opts.minMs : interval);
    }
  }

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

/** Flexible, ETag-based smart polling with 3 acceptable signatures. */
export function startSmartPollETag<T = any>(
  urlOrOpts:
    | string
    | {
        url: string;
        onUpdate: (payload: T) => void;
        key?: string;
        minMs?: number;
        maxMs?: number;
        versionHeader?: string;
        fetchInit?: RequestInit;
      },
  arg2?:
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
    tagHeader?: string; // legacy name
    fetchInit?: RequestInit;
  }
): PollStopper {
  // Normalize the three shapes
  let url: string;
  let onChange: (payload: T) => void;
  let key: string;
  let minMs = 4000;
  let maxMs = 60000;
  let tagHeader: string | undefined; // custom version header fallback
  let fetchInit: RequestInit | undefined;

  if (typeof urlOrOpts === 'string') {
    url = urlOrOpts;
    if (typeof arg2 === 'function') {
      // classic: (url, onChange, opts?)
      onChange = arg2 as (p: T) => void;
      key = arg3?.key ?? `url:${url}`;
      minMs = arg3?.minMs ?? minMs;
      maxMs = arg3?.maxMs ?? maxMs;
      tagHeader = arg3?.tagHeader;
      fetchInit = arg3?.fetchInit;
    } else if (arg2 && typeof arg2 === 'object') {
      // newer: (url, { onUpdate, key?, ... })
      const o = arg2 as any;
      if (!o || typeof o.onUpdate !== 'function') {
        throw new Error('startSmartPollETag: missing onUpdate');
      }
      onChange = o.onUpdate;
      key = o.key ?? `url:${url}`;
      minMs = o.minMs ?? minMs;
      maxMs = o.maxMs ?? maxMs;
      tagHeader = o.versionHeader; // prefer versionHeader name
      fetchInit = o.fetchInit;
    } else {
      throw new Error('startSmartPollETag: invalid arguments');
    }
  } else if (urlOrOpts && typeof urlOrOpts === 'object') {
    // object-only: ({ url, onUpdate, ... })
    const o = urlOrOpts as any;
    if (!o.url || typeof o.onUpdate !== 'function') {
      throw new Error('startSmartPollETag: { url, onUpdate } required');
    }
    url = o.url;
    onChange = o.onUpdate;
    key = o.key ?? `url:${url}`;
    minMs = o.minMs ?? minMs;
    maxMs = o.maxMs ?? maxMs;
    tagHeader = o.versionHeader;
    fetchInit = o.fetchInit;
  } else {
    throw new Error('startSmartPollETag: invalid arguments');
  }

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

      if (res.status === 304) return { status: 304, etag: curTag ?? null };
      if (!res.ok) return { status: 304, etag: curTag ?? null };

      const payload = (await res.json()) as T;
      const newTag =
        res.headers.get('etag') ||
        (tagHeader ? res.headers.get(tagHeader) : null) ||
        null;

      return { status: 200, etag: newTag, payload };
    },
    onChange,
  });
}

// Legacy alias
export const startSmartPoll = startSmartPollETag;
