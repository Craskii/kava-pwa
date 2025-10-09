// src/lib/poll.ts
export function startSmartPoll(fn: () => Promise<string | number | null>) {
  let timeout: any;
  let running = false;
  let backoff = 3000;   // start at 3s
  let lastVersion: string | number | null = null;

  async function tick() {
    if (running || document.visibilityState !== "visible" || !navigator.onLine) {
      schedule(); return;
    }
    running = true;
    try {
      const v = await fn();                 // fn should return a version string/number
      if (v !== lastVersion) {              // changed -> reset backoff
        lastVersion = v;
        backoff = 3000;
      } else {                              // same -> exponential backoff up to 30s
        backoff = Math.min(backoff * 2, 30000);
      }
    } catch { /* ignore */ }
    finally { running = false; schedule(); }
  }
  function schedule() { clearTimeout(timeout); timeout = setTimeout(tick, backoff); }
  function stop() { clearTimeout(timeout); }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { backoff = 3000; tick(); }
  });
  tick();
  return { stop, bump: () => { backoff = 3000; tick(); } };
}
