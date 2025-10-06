'use client';

import { useEffect, useState } from 'react';

function getIOSStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function useStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const mql: MediaQueryList | null =
      typeof window !== 'undefined' && 'matchMedia' in window
        ? window.matchMedia('(display-mode: standalone)')
        : null;

    const compute = () => Boolean((mql?.matches ?? false) || getIOSStandalone());
    setIsStandalone(compute());

    const onChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches || getIOSStandalone());
    };

    mql?.addEventListener('change', onChange);
    return () => {
      mql?.removeEventListener('change', onChange);
    };
  }, []);

  return isStandalone;
}
