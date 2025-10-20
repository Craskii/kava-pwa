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
        opts.onChange(res.payload);
        interval = Math.max(opts.minMs, Math.round(interval * 0.6)); // speed up on change
      } else {
        interval = Math.min(opts.maxMs, Math.round(interval * 1.35)); // backoff on 304
      }
    } catch {
      // network error → gentle backoff
      interval = Math.min(opts.maxMs, Math.round(interval * 1.5));
    } finally {
      write({ interval });
      if (!stopped) timer = setTimeout(() => tick(), force ? opts.minMs : interval);
    }
  }

  // start now
  tick(true);

  return {
    stop() { stopped = true; if (timer) clearTimeout(timer); },
    bump() { if (!stopped) { if (timer) clearTimeout(timer); interval = opts.minMs; tick(true); } },
  };
}
