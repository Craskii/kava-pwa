// Lightweight SW registration that notifies when an update is ready.
type Options = {
  scope?: string;
  onRegistered?: (reg: ServiceWorkerRegistration) => void;
  onUpdated?: (reg: ServiceWorkerRegistration) => void;
};

/**
 * Registers /sw.js and wires update events. Returns an "unregister" cleanup.
 */
export function registerSW(opts: Options = {}) {
  let stopped = false;
  const { scope = '/', onRegistered, onUpdated } = opts;

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope });
      onRegistered?.(reg);

      // If there's already a waiting worker, we have an update ready.
      if (reg.waiting) onUpdated?.(reg);

      // New worker is installed and waiting
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdated?.(reg);
          }
        });
      });

      // In case the worker gets "waiting" later (Safari)
      const checkWaiting = () => { if (reg.waiting) onUpdated?.(reg); };
      const int = window.setInterval(checkWaiting, 3000);

      // Allow cleanup
      return () => {
        stopped = true;
        clearInterval(int);
      };
    } catch (e) {
      // ignore
      return () => { stopped = true; };
    }
  };

  // Kick off registration
  let cleanup: (() => void) | undefined;
  register().then((c) => { cleanup = c; });
  return () => { if (!stopped) cleanup?.(); };
}
