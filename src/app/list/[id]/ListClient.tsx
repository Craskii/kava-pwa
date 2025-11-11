// src/app/list/[id]/ListClient.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import BackButton from '../../../components/BackButton';
import AlertsToggle from '../../../components/AlertsToggle';
import { useQueueAlerts, bumpAlerts } from '@/hooks/useQueueAlerts';
import { uid } from '@/lib/storage';
import { useRoomChannel } from '@/hooks/useRoomChannel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import DebugPanel, { debugLine } from '@/components/DebugPanel';

// …keep ALL your types, helpers, and the whole component implementation…

export default function ListLobby() {
  // your existing component body unchanged
}
