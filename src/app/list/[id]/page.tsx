"use client";
export const runtime = "edge";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import BackButton from "../../../components/BackButton";
import AlertsToggle from "../../../components/AlertsToggle";
import { useQueueAlerts, bumpAlerts } from "@/hooks/useQueueAlerts";
import { uid } from "@/lib/storage";
import { useRoomChannel } from "@/hooks/useRoomChannel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import DebugPanel, { debugLine } from "@/components/DebugPanel";

/* ============ Types ============ */
type TableLabel = "8 foot" | "9 foot";
type Table = { a?: string; b?: string; a1?: string; a2?: string; b1?: string; b2?: string; label: TableLabel; doubles?: boolean };
type SeatKey = keyof Pick<Table, 'a' | 'b' | 'a1' | 'a2' | 'b1' | 'b2'>;
const seatKeys = ['a', 'b', 'a1', 'a2', 'b1', 'b2'] as const satisfies SeatKey[];
const seatsForMode = (doubles: boolean) => doubles ? (['a1', 'a2', 'b1', 'b2'] as const) : (['a', 'b'] as const);
type Player = { id: string; name: string };
type Pref = "8 foot" | "9 foot" | "any";
type AuditEntry = { t: number; who?: string; type: string; note?: string };
const TEAM_PREFIX = "team:";
const isTeam = (id?: string) => typeof id === "string" && id.startsWith(TEAM_PREFIX);
const teamMembers = (id: string): [string, string] => {
  const raw = id.replace(TEAM_PREFIX, "");
  const [a, b] = raw.split("+");
  return [a, b] as [string, string];
};
type ListGame = {
  id: string; name: string; code?: string; hostId: string;
  status: "active"; createdAt: number;
  tables: Table[]; players: Player[];
  queue?: string[];
  queue8?: string[]; queue9?: string[];
  prefs?: Record<string, Pref>;
  cohosts?: string[];
  audit?: AuditEntry[];
  doubles?: boolean;
  v?: number; schema?: "v2";
};

/* ============ Globals ============ */
type KavaGlobals = {
  streams: Record<string, { es: EventSource | null; refs: number; backoff: number }>;
  heartbeats: Record<string, { t: number | null; refs: number }>;
  visHook: boolean;
};
function getGlobals(): KavaGlobals {
  const any = globalThis as any;
  if (!any.__kava_globs) any.__kava_globs = { streams: {}, heartbeats: {}, visHook: false } as KavaGlobals;
  return any.__kava_globs as KavaGlobals;
}

/* ============ Helpers ============ */
function coerceList(raw: any): ListGame | null {
  if (!raw) return null;
  try {
    const tables: Table[] = Array.isArray(raw.tables)
      ? raw.tables.map((t: any, i: number) => ({
          a: t?.a ? String(t.a) : undefined,
          b: t?.b ? String(t.b) : undefined,
          a1: t?.a1 ? String(t.a1) : (t?.a ? String(t.a) : undefined),
          a2: t?.a2 ? String(t.a2) : undefined,
          b1: t?.b1 ? String(t.b1) : (t?.b ? String(t.b) : undefined),
          b2: t?.b2 ? String(t.b2) : undefined,
          doubles: typeof t?.doubles === 'boolean' ? !!t.doubles : undefined,
          label: t?.label === "9 foot" || t?.label === "8 foot" ? t.label : i === 1 ? "9 foot" : "8 foot",
        }))
      : [{ label: "8 foot" }, { label: "9 foot" }];

    const players: Player[] = Array.isArray(raw.players)
      ? raw.players.map((p: any) => ({ id: String(p?.id ?? ""), name: String(p?.name ?? "Player") }))
      : [];

    const prefs: Record<string, Pref> = {};
    if (raw.prefs && typeof raw.prefs === "object") {
      for (const [pid, v] of Object.entries(raw.prefs)) {
        const vv = String(v);
        prefs[pid] = vv === "9 foot" || vv === "8 foot" || vv === "any" ? (vv as Pref) : "any";
      }
    }
    for (const p of players) if (!prefs[p.id]) prefs[p.id] = "any";

    let queue: string[] = Array.isArray(raw.queue)
      ? raw.queue.map((x: any) => String(x)).filter(Boolean)
      : [];
    if (queue.length === 0) {
      queue = [
        ...(Array.isArray(raw.queue9) ? raw.queue9 : []),
        ...(Array.isArray(raw.queue8) ? raw.queue8 : []),
      ].map((x: any) => String(x)).filter(Boolean);
    }

    const cohosts: string[] =
      Array.isArray(raw.cohosts) ? raw.cohosts.map(String) :
      Array.isArray(raw.coHosts) ? raw.coHosts.map(String) :
      [];

    const audit: AuditEntry[] = Array.isArray(raw.audit) ? raw.audit.slice(-100) : [];
    const doubles = !!raw.doubles;

    return {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? "Untitled"),
      code: raw.code ? String(raw.code) : undefined,
      hostId: String(raw.hostId ?? ""),
      status: "active",
      createdAt: Number(raw.createdAt ?? Date.now()),
      tables, players, queue, prefs,
      cohosts, audit,
      doubles,
      v: Number.isFinite(raw.v) ? Number(raw.v) : 0,
      schema: "v2",
    };
  } catch { return null; }
}

/* POST save (mirror coHosts & send x-user-id) */
async function saveList(doc: ListGame) {
  try {
    const me = JSON.parse(localStorage.getItem("kava_me") || "null");
    const payload: any = { ...doc, schema: "v2" };
    payload.coHosts = Array.isArray(doc.cohosts) ? [...doc.cohosts] : [];
    payload.cohosts = Array.isArray(doc.cohosts) ? [...doc.cohosts] : [];

    await fetch(`/api/list/${encodeURIComponent(doc.id)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": me?.id || ""
      },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store",
    });

    // Optional broadcast (ignore 404 if your /api/room route doesn't exist)
    fetch(`/api/room/list/${encodeURIComponent(doc.id)}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ v: Number(doc.v) || 0, data: doc }),
      keepalive: true,
    }).catch(() => {});
  } catch (e: any) {
    console.log("[saveList]", e?.message || e);
  }
}

/* ============ Component (all-in-one) ============ */
export default function Page() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));

  const [g, setG] = useState<ListGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameField, setNameField] = useState("");
  const [showTableControls, setShowTableControls] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lostMessage, setLostMessage] = useState<string | null>(null);
  const [supportsDnD, setSupportsDnD] = useState<boolean>(true);
  const [isVisible, setIsVisible] = useState<boolean>(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const [selectedQueuePid, setSelectedQueuePid] = useState<string | null>(null);

  const queue = g?.queue ?? [];
  const prefs = g?.prefs || {};
  const players = g?.players ?? [];
  const globalDoublesEnabled = g?.doubles ?? false;
  const isTableDoubles = (t: Table, fallback?: boolean) => t.doubles ?? fallback ?? globalDoublesEnabled;

  useEffect(() => {
    const detectDnDSupport = () => {
      if (typeof window === 'undefined') return true;
      const touch = 'ontouchstart' in window || (navigator as any).maxTouchPoints > 0;
      if (touch) return false;
      const el = document.createElement('div');
      return 'draggable' in el || ('ondragstart' in el && 'ondrop' in el);
    };
    setSupportsDnD(detectDnDSupport());
  }, []);

  useEffect(() => {
    const onVis = () => setIsVisible(document.visibilityState === 'visible');
    const onFocus = () => setIsVisible(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (lostMessageTimeoutRef.current) clearTimeout(lostMessageTimeoutRef.current);
    };
  }, []);

  const me = useMemo<Player>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("kava_me") || "null");
      if (saved?.id) return saved;
    } catch {}
    const fresh = { id: uid(), name: "Player" };
    localStorage.setItem("kava_me", JSON.stringify(fresh));
    return fresh;
  }, []);
  useEffect(() => { localStorage.setItem("kava_me", JSON.stringify(me)); }, [me]);

  useQueueAlerts({
    listId: id,
    upNextMessage: "your up next get ready!!",
    matchReadyMessage: (s: any) => {
      const raw = s?.tableNumber ?? s?.table?.number ?? null;
      const n = Number(raw);
      const shown = Number.isFinite(n) ? (n === 0 || n === 1 ? n + 1 : n) : null;
      return shown ? `Your in table (#${shown})` : "Your in table";
    },
  });

  const lastSeatSig = useRef<string>("");
  const lastVersion = useRef<number>(0);
  const excludeSeatPidRef = useRef<string | null>(null);
  const undoRef = useRef<ListGame[]>([]);
  const redoRef = useRef<ListGame[]>([]);
  const [, setHistoryTick] = useState(0);
  const lostMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clone = (doc: ListGame) => JSON.parse(JSON.stringify(doc)) as ListGame;

  const commitQ = useRef<(() => Promise<void>)[]>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<ListGame | null>(null);

  const suppressRef = useRef(false);
  const watchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<number | null>(null);
  const pollDelayRef = useRef<number>(3000);
  const pollOnceRef = useRef<() => Promise<void>>(async () => {});
  const pageRootRef = useRef<HTMLDivElement | null>(null);

  const seatChanged = (next: ListGame | null) => {
    if (!next) return false;
    const i = next.tables.findIndex(t => seatKeys.some(sk => seatValue(t, sk) === me.id));
    if (i < 0) { if (lastSeatSig.current) { lastSeatSig.current = ""; return true; } return false; }
    const t = next.tables[i]; const sig = `t${i}-${seatValues(t, !!next.doubles).map(x=>x||"x").join('-')}`;
    if (sig !== lastSeatSig.current) { lastSeatSig.current = sig; return true; }
    return false;
  };

  useRoomChannel({
    kind: "list",
    id,
    enabled: isVisible,
    onState: (msg: any) => {
      if (!msg) return;
      const raw = msg?.t === "state" ? msg.data : msg;
      const doc = coerceList(raw);
      if (!doc) return;
      const incomingV = doc.v ?? 0;
      if (incomingV <= (lastVersion.current || 0)) return;
      lastVersion.current = incomingV;
      setErr(null);
      setG(doc);
      if (seatChanged(doc)) bumpAlerts();
    },
    onError: (e: any) => {
      debugLine(`[sse error] ${e?.message || e}`);
      setErr("Stream error; falling back to polling…");
    },
  });

  /* Snapshot + Poll fallback */
  useEffect(() => {
    if (!id || id === "create") {
      setG(null);
      setErr(id === "create" ? "Waiting for a new list id…" : null);
      return;
    }

    const gl = getGlobals();
    if (!gl.streams[id]) gl.streams[id] = { es: null, refs: 0, backoff: 1000 };
    gl.streams[id].refs++;
    setErr(null);
    lastVersion.current = 0;

    pollDelayRef.current = isVisible ? 3000 : 12000;

    pollOnceRef.current = async () => {
      try {
        const res = await fetch(`/api/list/${encodeURIComponent(id)}?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const doc = coerceList(await res.json()); if (!doc) return;
        const v = doc.v ?? 0;
        if (v <= lastVersion.current) return;
        lastVersion.current = v;
        setErr(null);
        setG(doc);
        if (seatChanged(doc)) bumpAlerts();
      } catch (e:any) {
        debugLine(`[poll] ${e?.message || e}`);
      }
    };

    const startPoller = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => { void pollOnceRef.current(); }, pollDelayRef.current);
    };
    const stopPoller = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

    (async () => {
      try {
        const res = await fetch(`/api/list/${encodeURIComponent(id)}?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) {
            setErr("List not found yet (404). If you just created it, give it a moment.");
            startPoller();
          } else {
            setErr(`Failed to load list (${res.status}). Retrying…`);
            startPoller();
          }
          return;
        }
        const doc = coerceList(await res.json());
        if (!doc) {
          setErr("Invalid list data");
          startPoller();
          return;
        }
        lastVersion.current = doc.v ?? 0;
        setErr(null);
        setG(doc);
      } catch (e:any) {
        setErr("Network error loading list. Retrying…");
        debugLine(`[first fetch] ${e?.message || e}`);
        startPoller();
      }
    })();

    // heartbeat
    const hbKey = `hb:${id}:${me.id}`;
    if (!gl.heartbeats[hbKey]) gl.heartbeats[hbKey] = { t: null, refs: 0 };
    gl.heartbeats[hbKey].refs++;
    if (gl.heartbeats[hbKey].t) { clearTimeout(gl.heartbeats[hbKey].t as number); gl.heartbeats[hbKey].t = null; }
    const HEARTBEAT_MS = 25_000;
    const sendHeartbeat = () => {
      const url = `/api/me/status?userId=${encodeURIComponent(me.id)}&listId=${encodeURIComponent(id)}&ts=${Date.now()}`;
      try { fetch(url, { method: "GET", keepalive: true, cache: "no-store" }).catch(() => {}); }
      catch { const img = new Image(); (img as any).src = url; }
      gl.heartbeats[hbKey].t = window.setTimeout(sendHeartbeat, HEARTBEAT_MS);
    };
    gl.heartbeats[hbKey].t = window.setTimeout(sendHeartbeat, 500);

    return () => {
      const s = gl.streams[id];
      if (s) {
        s.refs--;
        if (s.refs <= 0) {
          if (s.es) { try { s.es.close(); } catch {} }
          delete gl.streams[id];
        }
      }
      const hb = gl.heartbeats[hbKey];
      if (hb) {
        hb.refs--;
        if (hb.refs <= 0) {
          if (hb.t) clearTimeout(hb.t as number);
          delete gl.heartbeats[hbKey];
        }
      }
      stopPoller();
    };
  }, [id, me.id]);

  useEffect(() => {
    pollDelayRef.current = isVisible ? 3000 : 12000;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => { void pollOnceRef.current(); }, pollDelayRef.current);
    }
  }, [isVisible]);

  /* Disable Android long-press */
  useEffect(() => {
    const root = pageRootRef.current;
    if (!root) return;
    const prevent = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable)) return;
      e.preventDefault();
    };
    root.addEventListener("contextmenu", prevent);
    return () => { root.removeEventListener("contextmenu", prevent); };
  }, []);

  useEffect(() => {
    if (selectedQueuePid && !queue.includes(selectedQueuePid)) {
      setSelectedQueuePid(null);
    }
  }, [queue, selectedQueuePid]);
  const anyTableDoubles = g?.tables?.some?.((t) => isTableDoubles(t as Table)) ?? false;
  const activeSeats = seatsForMode(globalDoublesEnabled);
  const seatValue = (t: Table, key: SeatKey) => (t as any)[key] as string | undefined;
  const setSeatValue = (t: Table, key: SeatKey, pid?: string) => {
    (t as any)[key] = pid;
    if (key === 'a1' || key === 'a') { t.a = pid; t.a1 = pid; }
    if (key === 'b1' || key === 'b') { t.b = pid; t.b1 = pid; }
  };
  const coerceTableMode = (table: Table, next: boolean, fallback?: boolean) => {
    const tt = { ...table } as Table;
    const prev = isTableDoubles(tt, fallback);
    if (prev === next) return tt;

    if (next) {
      if (!tt.a1 && tt.a) tt.a1 = tt.a;
      if (!tt.b1 && tt.b) tt.b1 = tt.b;
    } else {
      tt.a = tt.a1 || tt.a;
      tt.b = tt.b1 || tt.b;
      tt.a1 = tt.a;
      tt.b1 = tt.b;
      tt.a2 = undefined;
      tt.b2 = undefined;
    }

    tt.doubles = next;
    return tt;
  };
  const seatValues = (t: Table, doubles: boolean) => seatsForMode(doubles).map(k => seatValue(t, k));
  const clearPidFromTables = (d: ListGame, pid: string) => {
    d.tables = d.tables.map(t => {
      const nt = { ...t } as Table;
      seatKeys.forEach(k => { if (seatValue(nt, k) === pid) setSeatValue(nt, k, undefined); });
      return nt;
    });
  };
  const seatedPids = useMemo(() => {
    if (!g) return new Set<string>();
    const set = new Set<string>();
    g.tables.forEach(t => {
      seatKeys.forEach(key => {
        const val = seatValue(t, key);
        if (!val) return;
        set.add(val);
        if (isTeam(val)) teamMembers(val).forEach(m => set.add(m));
      });
    });
    return set;
  }, [g]);
  const iAmHost = g ? (me.id === g.hostId) : false;
  const iAmCohost = g ? ((g.cohosts ?? []).includes(me.id)) : false;
  const seatedIndex = g ? g.tables.findIndex((t) => seatKeys.some(sk => seatValue(t, sk) === me.id)) : -1;
  const seated = seatedIndex >= 0;
  const nameOf = (pid?: string) => {
    if (!pid) return "—";
    if (isTeam(pid)) {
      const [a, b] = teamMembers(pid);
      const na = players.find(p => p.id === a)?.name || "??";
      const nb = players.find(p => p.id === b)?.name || "??";
      return `${na} + ${nb}`;
    }
    return players.find(p => p.id === pid)?.name || "??";
  };
  const inQueue = (pid: string) => queue.some(q => q === pid || (isTeam(q) && teamMembers(q).includes(pid)));

  /* seating helper */
  function autoSeat(next: ListGame) {
    const excluded = excludeSeatPidRef.current;
    const pmap = next.prefs || {};

    const entryMatchesTable = (entry: string, want: TableLabel) => {
      if (!entry) return false;
      if (!isTeam(entry)) {
        const pref = (pmap[entry] ?? "any") as Pref;
        return pref === "any" || pref === want;
      }
      const [a, b] = teamMembers(entry);
      const pa = (pmap[a] ?? "any") as Pref;
      const pb = (pmap[b] ?? "any") as Pref;
      return (pa === "any" || pa === want) && (pb === "any" || pb === want);
    };

    const takeFromQueue = (want: TableLabel) => {
      for (let i = 0; i < (next.queue ?? []).length; i++) {
        const pid = next.queue![i];
        if (!pid) { next.queue!.splice(i, 1); i--; continue; }
        if (excluded && pid === excluded) continue;
        if (entryMatchesTable(pid, want)) { next.queue!.splice(i, 1); return pid; }
      }
      return undefined;
    };

    const fillFromPlayersIfNoQueue = false; // Require queue membership to auto-seat
    const seatedSet = new Set<string>();
    for (const t of next.tables) {
      seatKeys.forEach(sk => {
        const val = seatValue(t, sk);
        if (!val) return;
        seatedSet.add(val);
        if (isTeam(val)) teamMembers(val).forEach(m => seatedSet.add(m));
      });
    }

    const candidates = fillFromPlayersIfNoQueue
      ? next.players.map(p => p.id).filter(pid => !seatedSet.has(pid))
      : [];

    const takeFromPlayers = (want: TableLabel) => {
      for (let i = 0; i < candidates.length; i++) {
        const pid = candidates[i];
        if (!pid) continue;
        if (excluded && pid === excluded) continue;
        const pref = (pmap[pid] ?? "any") as Pref;
        if (pref === "any" || pref === want) { candidates.splice(i, 1); return pid; }
      }
      return undefined;
    };

    next.tables.forEach((t) => {
      const seatOrder = seatsForMode(isTableDoubles(t, next.doubles));
      seatOrder.forEach(sk => {
        if (!seatValue(t, sk)) setSeatValue(t, sk, takeFromQueue(t.label) ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined));
      });
    });

    excludeSeatPidRef.current = null;
  }

  /* commit batching */
  function flushPending() {
    if (!pendingDraft.current) return;
    const toSave = pendingDraft.current;
    pendingDraft.current = null;
    commitQ.current.push(async () => {
      setBusy(true);
      suppressRef.current = true;
      if (watchRef.current) clearTimeout(watchRef.current);
      watchRef.current = setTimeout(() => { setBusy(false); suppressRef.current = false; }, 8000);
      try {
        setG(toSave);
        await saveList(toSave);
        if (seatChanged(toSave)) bumpAlerts();
      } finally {
        if (watchRef.current) { clearTimeout(watchRef.current); watchRef.current = null; }
        setBusy(false);
        suppressRef.current = false;
      }
    });
    if (commitQ.current.length === 1) runNext();
  }
  async function runNext() {
    const job = commitQ.current.shift(); if (!job) return;
    await job();
    if (commitQ.current.length) runNext();
  }
  function scheduleCommit(mut: (draft: ListGame) => void, audit?: AuditEntry) {
    if (!g) return;
    if (!pendingDraft.current) {
      pendingDraft.current = clone(g);
      undoRef.current = [...undoRef.current.slice(-19), clone(g)];
      redoRef.current = [];
      setHistoryTick(v => v + 1);
      pendingDraft.current.prefs ??= {};
      for (const p of pendingDraft.current.players) if (!pendingDraft.current.prefs[p.id]) pendingDraft.current.prefs[p.id] = "any";
      pendingDraft.current.v = (Number(pendingDraft.current.v) || 0) + 1;
    }
    mut(pendingDraft.current);
    pendingDraft.current.audit ??= [...(pendingDraft.current.audit ?? g.audit ?? [])];
    if (audit) {
      pendingDraft.current.audit = [...(pendingDraft.current.audit ?? []), audit].slice(-100);
    }
    (pendingDraft.current as any).coHosts = [...(pendingDraft.current.cohosts ?? [])];
    autoSeat(pendingDraft.current);
    setG(pendingDraft.current);
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = setTimeout(() => {
      batchTimer.current = null;
      flushPending();
    }, 200);
  }

  const applySnapshot = (snapshot: ListGame) => {
    pendingDraft.current = clone(snapshot);
    pendingDraft.current.prefs ??= {};
    for (const p of pendingDraft.current.players) if (!pendingDraft.current.prefs[p.id]) pendingDraft.current.prefs[p.id] = "any";
    pendingDraft.current.v = (Number(pendingDraft.current.v) || 0) + 1;
    pendingDraft.current.audit = [...(pendingDraft.current.audit ?? [])].slice(-100);
    autoSeat(pendingDraft.current);
    setG(pendingDraft.current);
    flushPending();
  };

  const undo = () => {
    if (!undoRef.current.length || !g) return;
    const snapshot = undoRef.current.pop();
    if (!snapshot) return;
    redoRef.current = [...redoRef.current.slice(-19), clone(g)];
    setHistoryTick(v => v + 1);
    applySnapshot(snapshot);
  };

  const redo = () => {
    if (!redoRef.current.length || !g) return;
    const snapshot = redoRef.current.pop();
    if (!snapshot) return;
    undoRef.current = [...undoRef.current.slice(-19), clone(g)];
    setHistoryTick(v => v + 1);
    applySnapshot(snapshot);
  };

  /* actions */
  const renameList = (nm: string) => { const v = nm.trim(); if (!v) return; scheduleCommit(d => { d.name = v; }); };
  const ensureMe = (d: ListGame) => { if (!d.players.some(p => p.id === me.id)) d.players.push(me); d.prefs ??= {}; if (!d.prefs[me.id]) d.prefs[me.id] = "any"; };
  const addSelfToList = () => scheduleCommit(d => { ensureMe(d); });
  const joinQueue = () => scheduleCommit(d => { ensureMe(d); d.queue ??= []; if (!d.queue.includes(me.id)) d.queue.push(me.id); });
  const leaveQueue = () => scheduleCommit(d => { d.queue = (d.queue ?? []).filter(x => x !== me.id && !(isTeam(x) && teamMembers(x).includes(me.id))); });
  const addPlayer = () => { const v = nameField.trim(); if (!v) return; setNameField(""); const p: Player = { id: uid(), name: v }; scheduleCommit(d => { d.players.push(p); d.prefs ??= {}; d.prefs[p.id] = "any"; d.queue ??= []; if (!d.queue.includes(p.id)) d.queue.push(p.id); }); };
  const removePlayer = (pid: string) => scheduleCommit(d => { d.players = d.players.filter(p => p.id !== pid); d.queue = (d.queue ?? []).filter(x => x !== pid && !(isTeam(x) && teamMembers(x).includes(pid))); if (d.prefs) delete d.prefs[pid]; clearPidFromTables(d, pid); });
  const renamePlayer = (pid: string) => {
    const cur = players.find(p => p.id === pid)?.name || "";
    const nm = prompt("Rename player", cur); if (!nm) return;
    const v = nm.trim(); if (!v) return;
    scheduleCommit(d => {
      const p = d.players.find(pp => pp.id === pid);
      if (p) p.name = v;
    });
  };
  const setPrefFor = (pid: string, pref: Pref) => scheduleCommit(d => { d.prefs ??= {}; d.prefs[pid] = pref; });
  const enqueuePid = (pid: string) => scheduleCommit(d => { d.queue ??= []; if (!d.queue.includes(pid)) d.queue.push(pid); });
  const dequeuePid = (pid: string) => scheduleCommit(d => { d.queue = (d.queue ?? []).filter(x => x !== pid && !(isTeam(x) && teamMembers(x).includes(pid))); });

  type ConfirmState = { message: string; resolve: (v: boolean) => void } | null;
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const confirmYesNo = (message: string) => new Promise<boolean>(resolve => setConfirmState({ message, resolve }));

  const leaveList = async () => {
    // ✅ Confirm before leaving
    const confirmed = await confirmYesNo("Are you sure you want to leave this list?");
    if (!confirmed) return;

    scheduleCommit(d => {
      d.players = d.players.filter(p => p.id !== me.id);
      d.queue = (d.queue ?? []).filter(x => x !== me.id && !(isTeam(x) && teamMembers(x).includes(me.id)));
      clearPidFromTables(d, me.id);
      if (d.prefs) delete d.prefs[me.id];
    });

    // ✅ Navigate away after commit
    setTimeout(() => { window.location.href = '/lists'; }, 500);
  };

  const toggleCohost = (pid: string) => {
    scheduleCommit(d => {
      d.cohosts ??= [];
      const has = d.cohosts.includes(pid);
      d.cohosts = has ? d.cohosts.filter(x => x !== pid) : [...d.cohosts, pid];
      (d as any).coHosts = [...d.cohosts];
    });
  };

  const moveUp = (index: number) => scheduleCommit(d => {
    d.queue ??= [];
    if (index <= 0 || index >= d.queue.length) return;
    const a = d.queue[index - 1]; d.queue[index - 1] = d.queue[index]; d.queue[index] = a;
  });
  const moveDown = (index: number) => scheduleCommit(d => {
    d.queue ??= [];
    if (index < 0 || index >= d.queue.length - 1) return;
    const a = d.queue[index + 1]; d.queue[index + 1] = d.queue[index]; d.queue[index] = a;
  });

  const moveToTop = (pid: string) => scheduleCommit(d => {
    d.queue ??= [];
    d.queue = d.queue.filter(x => x !== pid);
    d.queue.unshift(pid);
  }, { t: Date.now(), who: me.id, type: 'queue-move-top', note: nameOf(pid) });

  const skipFirst = () => scheduleCommit(d => {
    d.queue ??= [];
    if (d.queue.length >= 2) {
      const first = d.queue.shift()!; const second = d.queue.shift()!;
      d.queue.unshift(first); d.queue.unshift(second);
    }
  });

  const iLost = async (pid?: string) => {
    const loser = pid ?? me.id;
    const playerName = nameOf(loser);

    const confirmed = await confirmYesNo(`${playerName}, are you sure you lost?`);
    if (!confirmed) return;
    const shouldQueue = await confirmYesNo('Put yourself back in the queue?');

    if (!shouldQueue) {
      if (lostMessageTimeoutRef.current) clearTimeout(lostMessageTimeoutRef.current);
      setLostMessage(`${playerName}, find your name in the Players list below and click "Queue" to rejoin.`);
      lostMessageTimeoutRef.current = setTimeout(() => setLostMessage(null), 8000);
    }

    const eliminated = new Set<string>([loser]);

    const findOpponents = () => {
      if (!g) return [] as string[];
      const t = g.tables.find(tt => seatKeys.some(sk => seatValue(tt, sk) === loser));
      if (!t) return [] as string[];
      const seatOfLoser = seatKeys.find(sk => seatValue(t, sk) === loser);
      if (!seatOfLoser) return [] as string[];
      const onLeft = seatOfLoser.startsWith('a');
      const opponentSeats = isTableDoubles(t)
        ? (onLeft ? (['b1', 'b2'] as SeatKey[]) : (['a1', 'a2'] as SeatKey[]))
        : (onLeft ? ['b'] as SeatKey[] : ['a'] as SeatKey[]);
      return opponentSeats.map(sk => seatValue(t, sk)).filter(Boolean) as string[];
    };
    const winners = findOpponents();

    const notePieces = [playerName];
    if (winners.length) notePieces.push(`lost to ${winners.map(nameOf).join(' / ')}`);

    scheduleCommit(d => {
      d.queue ??= [];
      const t = d.tables.find(tt => seatKeys.some(sk => seatValue(tt, sk) === loser));
      if (!t) return;

      const seatOfLoser = seatKeys.find(sk => seatValue(t, sk) === loser);
      if (isTableDoubles(t, d.doubles) && seatOfLoser) {
        const onLeft = seatOfLoser.startsWith('a');
        const teammates = onLeft ? (['a1', 'a2'] as SeatKey[]) : (['b1', 'b2'] as SeatKey[]);
        teammates.forEach(sk => {
          const teammate = seatValue(t, sk);
          if (teammate) eliminated.add(teammate);
        });
      }

      seatKeys.forEach(sk => { if (eliminated.has(seatValue(t, sk) ?? '')) setSeatValue(t, sk, undefined); });

      d.queue = (d.queue ?? []).filter(x => {
        if (eliminated.has(x)) return false;
        if (!isTeam(x)) return true;
        return !teamMembers(x).some(id => eliminated.has(id));
      });

      if (shouldQueue) {
        eliminated.forEach(p => { if (!d.queue!.includes(p)) d.queue!.push(p); });
      }

      excludeSeatPidRef.current = loser;
    }, { t: Date.now(), who: me.id, type: 'lost', note: notePieces.join(' — ') });
  };

  const moveSeatBetweenTables = (tableIndex: number, seat: SeatKey, direction: -1 | 1) => scheduleCommit(d => {
    if (!d.tables) return;
    const targetIndex = tableIndex + direction;
    if (targetIndex < 0 || targetIndex >= d.tables.length) return;

    const from = d.tables[tableIndex];
    const to = d.tables[targetIndex];
    const fromVal = seatValue(from, seat);
    const toVal = seatValue(to, seat);

    setSeatValue(from, seat, toVal);
    setSeatValue(to, seat, fromVal);
  });

  const confirmQueueSwap = async () => {
    if (typeof window === "undefined") return true;
    const ok = await confirmYesNo("Are you sure?");
    if (!ok) return false;
    const reminded = await confirmYesNo("Please make sure that the person you swap with is in order of the queue");
    return reminded;
  };

  const swapSeatWithQueue = (tableIndex: number, seat: SeatKey, queuePid: string) => {
    const current = g?.tables?.[tableIndex] ? seatValue(g.tables[tableIndex], seat) : undefined;
    const auditNote = `${nameOf(queuePid)} swapped with ${current ? nameOf(current) : 'an empty seat'} at Table ${tableIndex + 1} ${seat}`;

    scheduleCommit(d => {
      if (!d.tables) return;

      clearPidFromTables(d, queuePid);
      const table = d.tables[tableIndex];
      if (!table) return;

      const incoming = queuePid;
      const seated = seatValue(table, seat);

      setSeatValue(table, seat, incoming);
      d.queue = (d.queue ?? []).filter(x => x !== incoming);

      if (seated) {
        d.queue = (d.queue ?? []).filter(x => x !== seated);
        d.queue.push(seated);
      }
    }, { t: Date.now(), who: me.id, type: 'swap-queue-seat', note: auditNote });
  };

  /* UI */
  return (
    <ErrorBoundary>
      <main ref={pageRootRef} style={wrap}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <BackButton href="/" />
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={pillBadge}>Live</span>
            <AlertsToggle />
            <button style={btnGhostSm} onClick={()=>location.reload()}>Refresh</button>
          </div>
        </div>

        {!g ? (
          <>
            <p style={{ opacity: 0.7 }}>Loading…</p>
            {err && <p style={{opacity:.7, marginTop:6, fontSize:13}}>{err}</p>}
          </>
        ) : (
          <>
            <header style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap",marginTop:6}}>
              <div style={{flex:"1 1 260px", minWidth:0}}>
                <h1 style={{ margin:"8px 0 4px" }}>
                  <input
                    id="list-name"
                    name="listName"
                    autoComplete="organization"
                    defaultValue={g.name}
                    onBlur={(e)=> (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && renameList(e.currentTarget.value)}
                    style={nameInput}
                    disabled={busy || !(me.id === g.hostId || (g.cohosts ?? []).includes(me.id))}
                  />
                </h1>
                <div style={{ opacity:.8, fontSize:14, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  Private code: <b>{g.code || "—"}</b> • {g.players.length} {g.players.length === 1 ? "player" : "players"}
                  <span style={{opacity:.6}}>•</span>
                  <button
                    style={showHistory ? btnHistoryActive : btnGhostSm}
                    onClick={()=>setShowHistory(v=>!v)}
                  >
                    {showHistory?"Hide":"Show"} history
                  </button>
                  <span style={{opacity:.6}}>•</span>
                  <button style={btnGhostSm} onClick={undo} disabled={!undoRef.current.length}>⏪ Undo</button>
                  <button style={btnGhostSm} onClick={redo} disabled={!redoRef.current.length}>⏩ Forward</button>
                </div>
              </div>
              <div style={{display:"grid",gap:6,justifyItems:"stretch",minWidth:"min(260px, 100%)"}}>
                {!players.some(p => p.id === me.id) && (
                  <button style={btnGhost} onClick={addSelfToList} disabled={busy}>Add me as "{me.name}"</button>
                )}
                {!seated && !queue.includes(me.id) && <button style={btn} onClick={joinQueue} disabled={busy}>Join queue</button>}
                {queue.includes(me.id) && <button style={btnGhost} onClick={leaveQueue} disabled={busy}>Leave queue</button>}
                {g && me.id !== g.hostId && players.some(p => p.id === me.id) && (
                  <button style={btnGhost} onClick={leaveList} disabled={busy}>Leave list</button>
                )}
              </div>
            </header>

            {lostMessage && (
              <div style={messageBox}>
                ℹ️ {lostMessage}
              </div>
            )}

            {showHistory ? (
              <section style={card}>
                <h3 style={{marginTop:0}}>History (last {g.audit?.length ?? 0})</h3>
                {(g.audit?.length ?? 0) === 0 ? (
                  <div style={{opacity:.7}}>No actions yet.</div>
                ) : (
                  <ul style={{listStyle:"none",padding:0,margin:0,display:"grid",gap:6,maxHeight:220,overflow:"auto"}}>
                    {g.audit!.slice().reverse().map((a,i)=>(
                      <li key={i} style={{background:"#111",border:"1px solid #222",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                        <b style={{opacity:.9}}>{a.type}</b>
                        {a.note ? <span style={{opacity:.85}}> — {a.note}</span> : null}
                        <span style={{opacity:.6,marginLeft:6}}>{new Date(a.t).toLocaleTimeString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {/* Tables */}
            <section style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <h3 style={{marginTop:0}}>Tables</h3>
                {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && (
                  <button style={btnGhostSm} onClick={()=>setShowTableControls(v=>!v)}>
                    {showTableControls?"Hide table settings":"Table settings"}
                  </button>
                )}
              </div>

              {showTableControls && (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12,marginBottom:12}}>
                  {g.tables.map((t,i)=>(
                    <div key={i} style={{background:"#111",border:"1px solid #333",borderRadius:10,padding:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{fontWeight:600,opacity:.9}}>Table {i+1}</div>
                        <select
                          value={t.label}
                          onChange={(e)=>scheduleCommit(d=>{ d.tables[i].label = e.currentTarget.value === "9 foot" ? "9 foot" : "8 foot"; })}
                          style={select}
                          disabled={busy}
                        >
                          <option value="9 foot">9-foot</option><option value="8 foot">8-foot</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button
                      style={btnGhostSm}
                      onClick={()=>scheduleCommit(d=>{ if (d.tables.length<2) d.tables.push({label:d.tables[0]?.label==="9 foot"?"8 foot":"9 foot"}); })}
                      disabled={busy||g.tables.length>=2}
                    >Add second table</button>
                    <button
                      style={btnGhostSm}
                      onClick={()=>scheduleCommit(d=>{ if (d.tables.length>1) d.tables=d.tables.slice(0,1); })}
                      disabled={busy||g.tables.length<=1}
                    >Use one table</button>
                  </div>
                  <label style={{display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:600}}>
                    <input
                      type="checkbox"
                      checked={!!globalDoublesEnabled}
                        onChange={(e)=>{
                          const target = e.target as HTMLInputElement | null;
                          const next = !!target?.checked;
                        scheduleCommit(d=>{
                          d.doubles = next;
                          d.tables = d.tables.map(t => coerceTableMode(t, next, d.doubles));
                        });
                        }}
                        disabled={busy}
                      />
                    Enable doubles for all tables (tables can still switch individually)
                  </label>
                </div>
              )}

              <div style={{display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap:12, alignItems:'stretch'}}>
                {g.tables.map((t,i)=>{
                  const tableDoubles = isTableDoubles(t);
                  const Seat = ({side,label}:{side:SeatKey;label:string})=>{
                    const pid = seatValue(t, side);
                    const canSeat = (me.id === g.hostId || (g.cohosts ?? []).includes(me.id));
                    return (
                      <div
                        draggable={!!pid && canSeat && supportsDnD}
                        onDragStart={(e)=>pid && onDragStart(e,{type:"seat",table:i,side,pid})}
                        onDragOver={supportsDnD ? onDragOver : undefined}
                        onDrop={supportsDnD ? (e)=>handleDrop(e,{type:"seat",table:i,side,pid}) : undefined}
                        style={{minHeight:36,padding:"12px 12px",border:"1px dashed rgba(255,255,255,.25)",borderRadius:10,background:tableDoubles?"rgba(124,58,237,.16)":"rgba(56,189,248,.10)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8, boxShadow:"inset 0 1px 0 rgba(255,255,255,.08)", flexWrap:"wrap"}}
                        title={supportsDnD ? "Drag from queue, players, or swap seats" : "Use Queue controls"}
                      >
                        <span style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',minWidth:0,flex:'1 1 160px'}}>
                          <span style={dragHandleMini} aria-hidden>⋮</span>
                          <span style={{opacity:.7,fontSize:13,fontWeight:600}}>{label}</span>
                          <span style={{fontSize:15, wordBreak:'break-word'}}>{nameOf(pid)}</span>
                        </span>
                        {pid && (
                          <span style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
                            {g.tables.length > 1 && canSeat && (
                              <span style={{display:'flex',gap:4}}>
                                {i > 0 && <button style={btnTiny} onClick={()=>moveSeatBetweenTables(i, side, -1)} aria-label="Move to previous table">←</button>}
                                {i < g.tables.length - 1 && <button style={btnTiny} onClick={()=>moveSeatBetweenTables(i, side, 1)} aria-label="Move to next table">→</button>}
                              </span>
                            )}
                            {tableDoubles && canSeat && queue.length > 0 && (
                              <select
                                aria-label="Swap with a queue player"
                                defaultValue=""
                                onChange={async (e)=>{ const qp = e.currentTarget.value; if (!qp) return; if (!(await confirmQueueSwap())) { e.currentTarget.value = ''; return; } swapSeatWithQueue(i, side, qp); e.currentTarget.value = ''; }}
                                style={selectSmall}
                                disabled={busy}
                              >
                                <option value="">Swap with queue…</option>
                                {queue.map(qpid => <option key={qpid} value={qpid}>{nameOf(qpid)}</option>)}
                              </select>
                            )}
                            {(canSeat || pid===me.id) && <button style={btnMini} onClick={()=>iLost(pid)} disabled={busy}>Lost</button>}
                          </span>
                        )}
                      </div>
                    );
                  };
                  return (
                    <div key={i} style={{ background:tableDoubles?"#432775":"#0b3a66", borderRadius:12, padding:"12px 14px", border:tableDoubles?"1px solid rgba(168,85,247,.45)":"1px solid rgba(56,189,248,.35)", display:"grid", gap:10, fontSize:15, lineHeight:1.4 }}>
                      <div style={{ opacity:.9, fontSize:13, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", justifyContent:"space-between" }}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span>{t.label==="9 foot"?"9-Foot Table":"8-Foot Table"} • Table {i+1}</span>
                          {tableDoubles && <span style={pillBadge}>Doubles</span>}
                        </div>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                          <button
                            aria-pressed={tableDoubles}
                            aria-label={tableDoubles ? 'Switch table to singles' : 'Switch table to doubles'}
                            onClick={() => scheduleCommit(d => { d.tables[i] = coerceTableMode(d.tables[i], !tableDoubles, d.doubles); }, { t: Date.now(), who: me.id, type: 'table-mode', note: `${tableDoubles ? 'Doubles' : 'Singles'} → ${!tableDoubles ? 'Doubles' : 'Singles'} @ Table ${i+1}` })}
                            disabled={busy || !(me.id === g.hostId || (g.cohosts ?? []).includes(me.id))}
                            style={{border:'1px solid rgba(255,255,255,.16)',background:'rgba(0,0,0,.15)',borderRadius:999,display:'flex',alignItems:'center',padding:'6px 10px',gap:8,color:'#fff',boxShadow:'inset 0 1px 0 rgba(255,255,255,.08)',position:'relative',overflow:'hidden',minWidth:120,isolation:'isolate'}}
                          >
                            <span style={{opacity:.85,fontSize:12,fontWeight:700,position:'relative',zIndex:1}}>Singles</span>
                            <span style={{opacity:.85,fontSize:12,fontWeight:700,position:'relative',zIndex:1}}>Doubles</span>
                            <span
                              style={{
                                position:'absolute',
                                top:3,
                                bottom:3,
                                left:3,
                                width:'calc(50% - 6px)',
                                borderRadius:999,
                                background:'linear-gradient(135deg, rgba(59,130,246,.85), rgba(236,72,153,.85))',
                                transform:`translateX(${tableDoubles ? '100%' : '0'})`,
                                transition:'transform 160ms ease',
                                boxShadow:'0 8px 18px rgba(0,0,0,.25)',
                                pointerEvents:'none',
                                zIndex:0,
                              }}
                            />
                          </button>
                          <button style={btnGhostSm} onClick={() => scheduleCommit(d => {
                            const tt = d.tables[i];
                            ([['a','b'],['a1','b1'],['a2','b2']] as [SeatKey,SeatKey][]).forEach(([l,r]) => {
                              const lv = seatValue(tt, l);
                              const rv = seatValue(tt, r);
                              setSeatValue(tt, l, rv);
                              setSeatValue(tt, r, lv);
                            });
                          })} disabled={busy || !(me.id === g.hostId || (g.cohosts ?? []).includes(me.id))}>Swap sides</button>
                        </div>
                      </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'stretch',gap:10}}>
                  <div style={{display:'grid',gap:8}}>
                    <Seat side={tableDoubles ? 'a1' : 'a'} label={tableDoubles ? 'Left L1' : 'Player'}/>
                    {tableDoubles && <Seat side='a2' label='Left L2' />}
                  </div>
                  <div style={{opacity:.7,textAlign:'center',fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>vs</div>
                  <div style={{display:'grid',gap:8}}>
                    <Seat side={tableDoubles ? 'b1' : 'b'} label={tableDoubles ? 'Right R1' : 'Player'}/>
                    {tableDoubles && <Seat side='b2' label='Right R2' />}
                  </div>
                </div>
              </div>
            );
          })}
              </div>
              <div
                onDragOver={supportsDnD ? onDragOver : undefined}
                onDrop={supportsDnD ? (e)=>handleDrop(e,{type:'bench'}) : undefined}
                style={{marginTop:10,padding:'10px 12px',border:'1px dashed rgba(255,255,255,.25)',borderRadius:12,opacity:.75,fontSize:13,display:'flex',alignItems:'center',gap:10}}
              >
                <span style={dragHandleMini} aria-hidden>⋮</span>
                Drop here to clear a seat or remove from queue
              </div>
            </section>

            {/* Queue */}
            <section style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && selectedQueuePid && (
                    <button
                      style={btnGhostSm}
                      onClick={() => moveToTop(selectedQueuePid)}
                      disabled={busy}
                    >
                      Move selected to top
                    </button>
                  )}
                  {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && queue.length >= 2 && (
                    <button style={btnGhostSm} onClick={skipFirst} disabled={busy} title="Move #1 below #2">Skip first</button>
                  )}
                </div>
              </div>

              {anyTableDoubles && (
                <p style={{margin:"4px 0 10px", fontSize:12, opacity:.8}}>
                  Please make sure that the person you swap with is in order of the queue.
                </p>
              )}

              {queue.length===0 ? <div style={{opacity:.6,fontStyle:"italic"}}>Drop players here</div> : (
                <ol style={{margin:0,paddingLeft:18,display:"grid",gap:6}}
                    onDragOver={supportsDnD ? onDragOver : undefined}
                    onDrop={supportsDnD ? (e)=>handleDrop(e,{type:"queue",index:queue.length,pid:"__end" as any}) : undefined}>
                  {queue.map((pid,idx)=>{
                    const pref = (prefs[pid] ?? "any") as Pref;
                    const canEditSelf = pid===me.id;
                    const isSelected = selectedQueuePid === pid;
                    return (
                      <li key={`${pid}-${idx}`}
                          draggable={supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id))}
                          onDragStart={supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) ? (e)=>onDragStart(e,{type:"queue",index:idx,pid}) : undefined}
                          onDragOver={supportsDnD ? onDragOver : undefined}
                          onDrop={supportsDnD ? (e)=>handleDrop(e,{type:"queue",index:idx,pid}) : undefined}
                          onClick={()=>setSelectedQueuePid(p=>p===pid?null:pid)}
                          style={{...queueItem, border:isSelected?'1px solid rgba(14,165,233,.7)':'1px solid transparent', borderRadius:10, padding:'6px 6px'}}>
                        <span style={dragHandle} aria-hidden>⋮⋮</span>
                        <span style={bubbleName} title={supportsDnD ? "Drag to reorder" : "Use arrows to reorder"}>
                          {idx+1}. {nameOf(pid)}
                        </span>

                        {!supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && (
                          <div style={{display:"flex",gap:4,marginRight:6}}>
                            <button style={btnTiny} onClick={()=>moveUp(idx)} disabled={busy || idx===0} aria-label="Move up">▲</button>
                            <button style={btnTiny} onClick={()=>moveDown(idx)} disabled={busy || idx===queue.length-1} aria-label="Move down">▼</button>
                            <button style={btnTiny} onClick={()=>moveToTop(pid)} disabled={busy || idx===0} aria-label="Move to top">⇧</button>
                          </div>
                        )}

                        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                          {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id) || canEditSelf) ? (
                            <>
                              <button style={pref==="any"?btnTinyActive:btnTiny} onClick={(e)=>{e.stopPropagation();setPrefFor(pid,"any");}} disabled={busy}>Any</button>
                              <button style={pref==="9 foot"?btnTinyActive:btnTiny} onClick={(e)=>{e.stopPropagation();setPrefFor(pid,"9 foot");}} disabled={busy}>9-ft</button>
                              <button style={pref==="8 foot"?btnTinyActive:btnTiny} onClick={(e)=>{e.stopPropagation();setPrefFor(pid,"8 foot");}} disabled={busy}>8-ft</button>
                            </>
                          ) : (
                            <small style={{opacity:.7,width:48,textAlign:"right"}}>{pref==="any"?"Any":pref==="9 foot"?"9-ft":"8-ft"}</small>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {/* Host / Co-host controls */}
            {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) ? (
              <section style={card}>
                <h3 style={{marginTop:0}}>Host controls</h3>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                  <input
                    id="new-player"
                    name="playerName"
                    autoComplete="name"
                    placeholder="Add player name..."
                    value={nameField}
                    onChange={(e)=>setNameField(e.target.value)}
                    style={input}
                    disabled={busy}
                  />
                  <button style={btn} onClick={addPlayer} disabled={busy || !nameField.trim()}>Add player (joins queue)</button>
                </div>
              </section>
            ) : null}

            {/* Players */}
            <section style={card}>
              <button type="button" style={sectionToggle} onClick={()=>setShowPlayers(v=>!v)}>
                <h3 style={{margin:'0 0 0 0'}}>List (Players) — {players.length}</h3>
                <span aria-hidden style={{fontSize:18}}>{showPlayers ? '▲' : '▼'}</span>
                <span className="sr-only" style={{position:'absolute',width:1,height:1,padding:0,margin:-1,overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap',border:0}}>
                  {showPlayers ? 'Collapse player list' : 'Expand player list'}
                </span>
              </button>
              {showPlayers && (
                <>
                  <div style={{opacity:.75,fontSize:13,marginBottom:8,marginTop:6,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span style={dragHandleMini} aria-hidden>⋮</span>
                    Drag a player onto a table side to seat them, or onto the queue to line them up.
                  </div>
                  {players.length===0 ? <div style={{opacity:.7}}>No players yet.</div> : (
                    <ul style={{ listStyle:"none", padding:0, margin:0, display:"grid", gap:8 }}>
                      {players.map(p=>{
                        const pref = (prefs[p.id] ?? "any") as Pref;
                        const canEditSelf = p.id===me.id;
                        const isCohost = (g.cohosts ?? []).includes(p.id);
                        const isSeated = seatedPids.has(p.id);
                        const status = isSeated ? "table" : (inQueue(p.id) ? "queue" : "idle");
                        return (
                          <li
                            key={p.id}
                            style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#111", padding:"10px 12px", borderRadius:10 }}
                            draggable={supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id))}
                            onDragStart={supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) ? (e)=>onDragStart(e,{type:"player",pid:p.id}) : undefined}
                            onDragOver={supportsDnD ? onDragOver : undefined}
                            onDrop={supportsDnD ? (e)=>handleDrop(e,{type:"queue",index:queue.length,pid:p.id}) : undefined}
                          >
                            <span style={{display:'flex',alignItems:'center',gap:8}}>
                              <span>{p.name}{isCohost ? <em style={{opacity:.6,marginLeft:8}}>(Cohost)</em> : null}</span>
                              <span style={{fontSize:11,opacity:.65,padding:'3px 8px',borderRadius:999,border:'1px solid rgba(255,255,255,.18)'}}>
                                {status}
                              </span>
                            </span>
                            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                              {!inQueue(p.id)
                                ? ((me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) ? <button style={btnMini} onClick={()=>enqueuePid(p.id)} disabled={busy || isSeated}>Queue</button> : null)
                                : ((me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) ? <button style={btnMini} onClick={()=>dequeuePid(p.id)} disabled={busy}>Dequeue</button> : null)}
                              {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id) || canEditSelf) && (
                                <div style={{display:"flex",gap:6}}>
                                  <button style={pref==="any"?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,"any")} disabled={busy}>Any</button>
                                  <button style={pref==="9 foot"?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,"9 foot")} disabled={busy}>9-ft</button>
                                  <button style={pref==="8 foot"?btnTinyActive:btnTiny} onClick={()=>setPrefFor(p.id,"8 foot")} disabled={busy}>8-ft</button>
                                </div>
                              )}
                              {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && p.id !== g.hostId && (
                                <button style={btnMini} onClick={()=>toggleCohost(p.id)} disabled={busy}>
                                  {isCohost ? "Remove cohost" : "Make cohost"}
                                </button>
                              )}
                              {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id) || canEditSelf) && <button style={btnMini} onClick={()=>renamePlayer(p.id)} disabled={busy}>Rename</button>}
                              {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && <button style={btnGhost} onClick={()=>removePlayer(p.id)} disabled={busy}>Remove</button>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
      {confirmState && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50}}>
          <div style={{background:"#0f172a",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"16px 18px",width:"min(420px, 92vw)",boxShadow:"0 20px 50px rgba(0,0,0,0.45)"}}>
            <div style={{marginBottom:14,fontWeight:700,lineHeight:1.4}}>{confirmState.message}</div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
              <button style={btnMini} onClick={()=>{ confirmState.resolve(false); setConfirmState(null); }}>No</button>
              <button style={{...btnMini, background:"#0ea5e9", border:"none"}} onClick={()=>{ confirmState.resolve(true); setConfirmState(null); }}>Yes</button>
            </div>
          </div>
        </div>
      )}
      <DebugPanel/>
    </ErrorBoundary>
  );

  /* DnD helpers */
  type DragInfo =
    | { type: "seat"; table: number; side: SeatKey; pid?: string }
    | { type: "queue"; index: number; pid: string }
    | { type: "player"; pid: string }
    | { type: "bench" };

  function onDragStart(e: React.DragEvent, info: DragInfo) { e.dataTransfer.setData("application/json", JSON.stringify(info)); e.dataTransfer.effectAllowed = "move"; }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function parseInfo(ev: React.DragEvent): DragInfo | null { try { return JSON.parse(ev.dataTransfer.getData("application/json")); } catch { return null; } }
  function handleDrop(ev: React.DragEvent, target: DragInfo) {
    if (!g) return;
    ev.preventDefault();
    const src = parseInfo(ev); if (!src) return;
    scheduleCommit(d => {
      d.queue ??= [];
      const moveWithin = (arr: string[], from: number, to: number) => { const a = [...arr]; const [p] = a.splice(from, 1); a.splice(Math.max(0, Math.min(a.length, to)), 0, p); return a; };
      const removeEverywhere = (pid: string) => { d.queue = (d.queue ?? []).filter(x => x !== pid); clearPidFromTables(d, pid); };
      const placeSeat = (ti: number, side: SeatKey, pid?: string) => { if (!pid) return; removeEverywhere(pid); setSeatValue(d.tables[ti], side, pid); };

      if (target.type === "seat") {
        if (src.type === "seat") {
          const sp = seatValue(d.tables[src.table], src.side), tp = seatValue(d.tables[target.table], target.side);
          setSeatValue(d.tables[src.table], src.side, tp); setSeatValue(d.tables[target.table], target.side, sp);
        } else if (src.type === "queue") {
          d.queue = (d.queue ?? []).filter(x => x !== src.pid);
          placeSeat(target.table, target.side, src.pid);
        } else if (src.type === "player") {
          placeSeat(target.table, target.side, src.pid);
        }
      } else if (target.type === "queue") {
        if (src.type === "queue") d.queue = moveWithin(d.queue!, src.index, target.index);
        else if (src.type === "seat") { const pid = seatValue(d.tables[src.table], src.side); setSeatValue(d.tables[src.table], src.side, undefined); if (pid) d.queue!.splice(target.index, 0, pid); }
        else if (src.type === "player") { if (!d.queue!.includes(src.pid)) d.queue!.splice(target.index, 0, src.pid); }
      } else if (target.type === "bench") {
        if (src.type === "seat") { const pid = seatValue(d.tables[src.table], src.side); setSeatValue(d.tables[src.table], src.side, undefined); removeEverywhere(pid ?? ""); }
        if (src.type === "queue") { d.queue = (d.queue ?? []).filter(x => x !== src.pid); }
      }
    });
  }
}

/* ============ Styles ============ */
const wrap: React.CSSProperties = { minHeight:"100vh", background:"#0b0b0b", color:"#fff", padding:24, fontFamily:"system-ui", fontSize:17, lineHeight:1.5, WebkitTouchCallout:"none" };
const card: React.CSSProperties = { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:14, padding:14, marginBottom:14 };
const btn: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer" };
const btnGhost: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer" };
const btnGhostSm: React.CSSProperties = { padding:"6px 10px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer", fontWeight:600 };
const btnHistoryActive: React.CSSProperties = { ...btnGhostSm, boxShadow:"0 0 0 2px rgba(14,165,233,0.45), 0 10px 30px rgba(14,165,233,0.15)", border:"1px solid rgba(14,165,233,0.8)", background:"rgba(14,165,233,0.15)" };
const btnMini: React.CSSProperties = { padding:"6px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer", fontSize:12 };
const btnTiny: React.CSSProperties = { padding:"4px 8px", borderRadius:8, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer", fontSize:12, lineHeight:1 };
const btnTinyActive: React.CSSProperties = { ...btnTiny, background:"#0ea5e9", border:"none" };
const pillBadge: React.CSSProperties = { padding:"6px 10px", borderRadius:999, background:"rgba(16,185,129,.2)", border:"1px solid rgba(16,185,129,.35)", fontSize:12 };

const input: React.CSSProperties = {
  width:260, maxWidth:"90vw", padding:"10px 12px", borderRadius:10,
  border:"1px solid #333",  // fixed quotes
  background:"#111", color:"#fff"
} as any;

const nameInput: React.CSSProperties = { background:"#111", border:"1px solid #333", color:"#fff", borderRadius:10, padding:"8px 10px", width:"min(420px, 80vw)" };
const select: React.CSSProperties = { background:"#111", border:"1px solid #333", color:"#fff", borderRadius:8, padding:"6px 8px" };
const selectSmall: React.CSSProperties = { ...select, fontSize:12, padding:"4px 8px", minWidth:150 };
const messageBox: React.CSSProperties = {
  background:"rgba(14,165,233,0.15)",
  border:"1px solid rgba(14,165,233,0.35)",
  borderRadius:12,
  padding:"12px 14px",
  marginTop:8,
  fontSize:14,
  fontWeight:600,
};

const bubbleName: React.CSSProperties = {
  flex: "1 1 auto",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px dashed rgba(255,255,255,.35)",
  background: "linear-gradient(120deg, rgba(255,255,255,.08), rgba(14,165,233,.08))",
  cursor: "grab",
  userSelect: "none",
  boxShadow: "0 4px 12px rgba(0,0,0,0.22)",
  minWidth: 0,
  wordBreak: "break-word",
};
const queueItem: React.CSSProperties = {
  cursor:"grab",
  display:"flex",
  alignItems:"flex-start",
  gap:10,
  justifyContent:"space-between",
  flexWrap:"wrap",
  rowGap:6,
};
const sectionToggle: React.CSSProperties = {
  width:"100%",
  display:"flex",
  alignItems:"center",
  justifyContent:"space-between",
  background:"transparent",
  color:"inherit",
  border:"none",
  padding:0,
  cursor:"pointer",
  textAlign:"left"
};
const dragHandle: React.CSSProperties = {
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  width:28,
  height:28,
  borderRadius:10,
  background:"rgba(255,255,255,0.06)",
  border:"1px solid rgba(255,255,255,0.15)",
  fontWeight:700,
  color:"rgba(255,255,255,0.65)",
};
const dragHandleMini: React.CSSProperties = {
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  width:22,
  height:22,
  borderRadius:8,
  background:"rgba(255,255,255,0.06)",
  border:"1px solid rgba(255,255,255,0.12)",
  color:"rgba(255,255,255,0.65)",
  fontSize:12,
};