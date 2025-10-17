type Options = {
  scope?: string;
  onRegistered?: (reg: ServiceWorkerRegistration) => void;
  onUpdated?: (reg: ServiceWorkerRegistration) => void;
};

export function registerSW(opts: Options = {}) {
  let stopped = false;
  const { scope = '/', onRegistered, onUpdated } = opts;

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope });
      onRegistered?.(reg);

      if (reg.waiting) onUpdated?.(reg);

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdated?.(reg);
          }
        });
      });

      const ping = () => { if (reg.waiting) onUpdated?.(reg); };
      const int = window.setInterval(ping, 3000);

      return () => { stopped = true; clearInterval(int); };
    } catch {
      return () => { stopped = true; };
    }
  };

  let cleanup: (() => void) | undefined;
  register().then((c) => { cleanup = c; });
  return () => { if (!stopped) cleanup?.(); };
}
