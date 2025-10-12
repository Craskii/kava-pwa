// src/app/_not-found/page.tsx
// Some adapters still reference the legacy "/_not-found" route.
// Make it a thin proxy to app/not-found and mark as edge.

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import NotFound from '../not-found';
export default NotFound;
