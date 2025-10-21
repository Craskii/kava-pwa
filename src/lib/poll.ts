// src/lib/poll.ts
// SSR-safe smart polling with ETag + adaptive backoff.
// No top-level access to `window` or other browser globals.

export type SmartPoll = { stop: () => void; bump: () => void };

type Options<T> = {
  key: string;                       // used only if you want to key multiple polls; no storage here
  versionHeader?: string;            // e.g. 'x-t-version' or 'x-l-version' (optional)
  onUpdate: (payload: T | null) => void;
  minMs?: number;                    // default 4000
  maxMs?: number;                    // default 60000
};

export function startSmartPollETag<T>(
  url: string,
  opts: Options<T>
): SmartPoll {
  let stopped = false;
  let etag: string | null = null;

  let delay = opts.minMs ?? 4000;
  const maxDelay = opts.maxMs ?? 60000;

  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    if (stopped) return;

    try {
      const res = await fetch(url, {
        headers: etag ? { 'If-None-Match': etag } : undefined,
        cache: 'no-store',
      });

      if (res.status === 200) {
        etag = res.headers.get('etag');
        const data = (await res.json()) as T;
        opts.onUpdate(data);
        // reset backoff on change
        delay = opts.minMs ?? 4000;
      } else if (res.status === 304) {
        // no change -> gentle backoff
        delay = Math.min(Math.round(delay * 1.5), maxDelay);
      } else {
        // error -> stronger backoff
        delay = Math.min(Math.round(delay * 2), maxDelay);
      }
    } catch {
      delay = Math.min(Math.round(delay * 2), maxDelay);
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, delay);
      }
    }
  }

  // kick off shortly after hydrate to avoid blocking
  timer = setTimeout(tick, 200);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    bump() {
      // caller can “nudge” after a write
      delay = opts.minMs ?? 4000;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, 50);
    },
  };
}
