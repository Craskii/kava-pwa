// src/lib/poll.ts
// Adaptive ETag-backed poller (client-safe) + backward-compatible shim.

export type AdaptivePollResult<T> = {
  status: 200 | 304;
  etag: string | null;
  payload?: T;
};

export type AdaptivePollOptions<T> = {
  key: string;
  minMs?: number;                  // default 4000
  maxMs?: number;                  // default 60000
  fetchOnce: (etag?: string | null) => Promise<AdaptivePollResult<T>>;
  onChange: (payload: T) => void;  // called only on status=200
};

export type AdaptivePollHandle = {
  stop: () => void;
  bump: () => void;
};

export function startAdaptivePoll<T>(opts: AdaptivePollOptions<T>): AdaptivePollHandle {
  const minMs = Math.max(500, opts.minMs ?? 4000);
  const maxMs = Math.max(minMs, opts.maxMs ?? 60000);

  let stopped = false;
  let etag: string | null = null;
  let delay = minMs;
  let nextTimer: any = null;
  let pending = false;

  async function tick() {
    if (stopped || pending) return;
    pending = true;
    try {
      const res = await opts.fetchOnce(etag);
      if (res.status === 200 && res.payload !== undefined) {
        etag = res.etag ?? etag;
        delay = minMs;
        opts.onChange(res.payload);
      } else {
        etag = res.etag ?? etag;
        delay = Math.min(Math.floor(delay * 1.6), maxMs);
      }
    } catch {
      delay = Math.min(Math.floor(delay * 2), maxMs);
    } finally {
      pending = false;
      if (!stopped) nextTimer = setTimeout(tick, delay);
    }
  }

  nextTimer = setTimeout(tick, 0);

  return {
    stop() {
      stopped = true;
      if (nextTimer) clearTimeout(nextTimer);
      nextTimer = null;
    },
    bump() {
      if (stopped) return;
      delay = minMs;
      if (nextTimer) clearTimeout(nextTimer);
      nextTimer = setTimeout(tick, 0);
    }
  };
}

/* ------------------------------------------------------------------
   BACKWARD-COMPAT SHIM
   Some old pages may call `startSmartPollETag(...)` (no import).
   We expose a global shim and also export the name for any code that imports it.
-------------------------------------------------------------------*/

// Signature-compatible alias (we accept the same options object used above)
export function startSmartPollETag<T>(opts: AdaptivePollOptions<T>): AdaptivePollHandle {
  return startAdaptivePoll<T>(opts);
}
