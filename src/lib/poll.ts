// src/lib/poll.ts
// Adaptive, one-tab polling with ETag/304 + focus/visibility + backoff.

type PollOptions<TPayload> = {
  key: string;                   // stable key per resource (used for leader election)
  minMs?: number;                // fastest interval
  maxMs?: number;                // slowest interval
  versionHeader?: string;        // eg: 'x-l-version'
  onUpdate: (payload: TPayload) => void;
};

function leaderKey(key: string) {
  return `poll-leader:${key}`;
}

function isLeader(key: string) {
  const now = Date.now();
  const cur = Number(localStorage.getItem(leaderKey(key)) || 0);
  if (now > cur) {
    // become leader for 5s
    localStorage.setItem(leaderKey(key), String(now + 5000));
    return true;
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startSmartPollETag<TPayload = any>(
  endpoint: string,
  opts: PollOptions<TPayload>
) {
  const minMs = Math.max(800, opts.minMs ?? 1500);
  const maxMs = Math.max(minMs, opts.maxMs ?? 60000);
  let stopFlag = false;
  let curDelay = minMs;
  let etag: string | null = null;

  // bump: used by pages when they perform a write, to fetch soon
  async function bump() {
    curDelay = minMs;
  }

  async function tick() {
    while (!stopFlag) {
      // run only if this tab is leader & page visible
      if (document.visibilityState === 'visible' && isLeader(opts.key)) {
        try {
          const res = await fetch(endpoint, {
            cache: 'no-store',
            headers: etag ? { 'If-None-Match': etag } : undefined,
          });

          if (res.status === 200) {
            const nextTag =
              res.headers.get('etag') ||
              (opts.versionHeader ? res.headers.get(opts.versionHeader) : null);

            const payload = (await res.json()) as TPayload;

            if (nextTag && nextTag !== etag) {
              etag = nextTag;
            }
            opts.onUpdate(payload);
            // fast again after change
            curDelay = minMs;
          } else if (res.status === 304) {
            // no change -> back off
            curDelay = Math.min(curDelay * 1.5, maxMs);
          } else {
            // server hiccup -> back off more
            curDelay = Math.min(curDelay * 2, maxMs);
          }
        } catch {
          // network error: exponential backoff
          curDelay = Math.min(curDelay * 2, maxMs);
        }
      } else {
        // not leader or hidden -> back off to save CPU
        curDelay = Math.min(curDelay * 2, maxMs);
      }
      await sleep(curDelay);
    }
  }

  // reset delay on focus/visibility change
  const onVis = () => (curDelay = minMs);
  window.addEventListener('focus', onVis);
  document.addEventListener('visibilitychange', onVis);

  tick();

  return {
    stop() {
      stopFlag = true;
      window.removeEventListener('focus', onVis);
      document.removeEventListener('visibilitychange', onVis);
    },
    bump,
  };
}
