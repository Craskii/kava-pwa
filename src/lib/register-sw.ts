// src/lib/register-sw.ts
export function setupServiceWorker(onUpdate?: () => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      // Check for updates when the tab becomes visible again
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });

      // When a new worker is found, tell UI
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            onUpdate?.();
          }
        });
      });
    })
    .catch(() => { /* ignore */ });

  // If a new SW takes control, reload once to apply it
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
