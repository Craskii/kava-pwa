// src/lib/poll-globals.ts
'use client';

import { startSmartPollETag, startAdaptivePoll } from './poll';

// Attach both names to the global for legacy code paths that expect window-level access.
// This does NOT affect modern modules that import the functions.
const g = globalThis as any;
if (!g.startSmartPollETag) g.startSmartPollETag = (opts: any) => startSmartPollETag(opts);
if (!g.startAdaptivePoll) g.startAdaptivePoll = (opts: any) => startAdaptivePoll(opts);
