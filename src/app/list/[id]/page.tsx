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
type Table = { a?: string; b?: string; label: TableLabel };
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
const makeTeamId = (a: string, b: string) => `${TEAM_PREFIX}${[a, b].sort().join("+")}`;
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
  const [err, setErr] = useState<string | null>(null);
  const [supportsDnD, setSupportsDnD] = useState<boolean>(true);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  useEffect(() => { setSupportsDnD(true); }, []);

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

  const commitQ = useRef<(() => Promise<void>)[]>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<ListGame | null>(null);

  const suppressRef = useRef(false);
  const watchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<number | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);

  const seatChanged = (next: ListGame | null) => {
    if (!next) return false;
    const i = next.tables.findIndex(t => t.a === me.id || t.b === me.id);
    if (i < 0) { if (lastSeatSig.current) { lastSeatSig.current = ""; return true; } return false; }
    const t = next.tables[i]; const sig = `t${i}-${t.a ?? "x"}-${t.b ?? "x"}`;
    if (sig !== lastSeatSig.current) { lastSeatSig.current = sig; return true; }
    return false;
  };

  const sseEnabled = typeof document !== "undefined" && document.visibilityState === "visible";

  useRoomChannel({
    kind: "list",
    id,
    enabled: sseEnabled,
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

    const startPoller = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(async () => {
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
      }, 3000);
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

  const queue = g?.queue ?? [];
  const prefs = g?.prefs || {};
  const players = g?.players ?? [];
  const doublesEnabled = g?.doubles ?? false;
  const seatedPids = useMemo(() => {
    if (!g) return new Set<string>();
    const set = new Set<string>();
    g.tables.forEach(t => {
      const sides = [t.a, t.b];
      sides.forEach(val => {
        if (!val) return;
        set.add(val);
        if (isTeam(val)) teamMembers(val).forEach(m => set.add(m));
      });
    });
    return set;
  }, [g]);
  const iAmHost = g ? (me.id === g.hostId) : false;
  const iAmCohost = g ? ((g.cohosts ?? []).includes(me.id)) : false;
  const seatedIndex = g ? g.tables.findIndex((t) => t.a === me.id || t.b === me.id) : -1;
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
      if (t.a) {
        seatedSet.add(t.a);
        if (isTeam(t.a)) teamMembers(t.a).forEach(m => seatedSet.add(m));
      }
      if (t.b) {
        seatedSet.add(t.b);
        if (isTeam(t.b)) teamMembers(t.b).forEach(m => seatedSet.add(m));
      }
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
      if (!t.a) {
        const fromQ = takeFromQueue(t.label);
        const pid = fromQ ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined);
        if (pid) t.a = pid;
      }
      if (!t.b) {
        const fromQ = takeFromQueue(t.label);
        const pid = fromQ ?? (fillFromPlayersIfNoQueue ? takeFromPlayers(t.label) : undefined);
        if (pid) t.b = pid;
      }
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
  function scheduleCommit(mut: (draft: ListGame) => void) {
    if (!g) return;
    if (!pendingDraft.current) {
      pendingDraft.current = JSON.parse(JSON.stringify(g));
      pendingDraft.current.prefs ??= {};
      for (const p of pendingDraft.current.players) if (!pendingDraft.current.prefs[p.id]) pendingDraft.current.prefs[p.id] = "any";
      pendingDraft.current.v = (Number(pendingDraft.current.v) || 0) + 1;
    }
    mut(pendingDraft.current);
    (pendingDraft.current as any).coHosts = [...(pendingDraft.current.cohosts ?? [])];
    autoSeat(pendingDraft.current);
    setG(pendingDraft.current);
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = setTimeout(() => {
      batchTimer.current = null;
      flushPending();
    }, 200);
  }

  /* actions */
  const renameList = (nm: string) => { const v = nm.trim(); if (!v) return; scheduleCommit(d => { d.name = v; }); };
  const ensureMe = (d: ListGame) => { if (!d.players.some(p => p.id === me.id)) d.players.push(me); d.prefs ??= {}; if (!d.prefs[me.id]) d.prefs[me.id] = "any"; };
  const addSelfToList = () => scheduleCommit(d => { ensureMe(d); });
  const joinQueue = () => scheduleCommit(d => { ensureMe(d); d.queue ??= []; if (!d.queue.includes(me.id)) d.queue.push(me.id); });
  const leaveQueue = () => scheduleCommit(d => { d.queue = (d.queue ?? []).filter(x => x !== me.id && !(isTeam(x) && teamMembers(x).includes(me.id))); });
  const addPlayer = () => { const v = nameField.trim(); if (!v) return; setNameField(""); const p: Player = { id: uid(), name: v }; scheduleCommit(d => { d.players.push(p); d.prefs ??= {}; d.prefs[p.id] = "any"; d.queue ??= []; if (!d.queue.includes(p.id)) d.queue.push(p.id); }); };
  const addTeamToQueue = () => {
    if (!doublesEnabled) return;
    const a = teamA.trim();
    const b = teamB.trim();
    if (!a || !b || a === b) return;
    enqueueTeam(a, b);
    setTeamA("");
    setTeamB("");
  };
  const removePlayer = (pid: string) => scheduleCommit(d => { d.players = d.players.filter(p => p.id !== pid); d.queue = (d.queue ?? []).filter(x => x !== pid && !(isTeam(x) && teamMembers(x).includes(pid))); if (d.prefs) delete d.prefs[pid]; d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b })); });
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
  const enqueueTeam = (pidA: string, pidB: string) => scheduleCommit(d => { const entry = makeTeamId(pidA, pidB); d.queue ??= []; if (!d.queue.includes(entry)) d.queue.push(entry); });
  const dequeuePid = (pid: string) => scheduleCommit(d => { d.queue = (d.queue ?? []).filter(x => x !== pid && !(isTeam(x) && teamMembers(x).includes(pid))); });

  const leaveList = () => {
  // ✅ Confirm before leaving
  if (!confirm("Are you sure you want to leave this list?")) return;
  
  scheduleCommit(d => {
    d.players = d.players.filter(p => p.id !== me.id);
    d.queue = (d.queue ?? []).filter(x => x !== me.id && !(isTeam(x) && teamMembers(x).includes(me.id)));
    d.tables = d.tables.map(t => ({ ...t, a: t.a === me.id ? undefined : t.a, b: t.b === me.id ? undefined : t.b }));
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

  const skipFirst = () => scheduleCommit(d => {
    d.queue ??= [];
    if (d.queue.length >= 2) {
      const first = d.queue.shift()!; const second = d.queue.shift()!;
      d.queue.unshift(first); d.queue.unshift(second);
    }
  });

  const iLost = (pid?: string) => {
    const loser = pid ?? me.id;
    const playerName = nameOf(loser);

    if (!confirm(`${playerName}, are you sure you lost?`)) return;
    const shouldQueue = confirm('Put yourself back in the queue?');

    if (!shouldQueue) {
      alert(`${playerName}, find your name in the Players list below and click "Queue" to rejoin.`);
    }

    scheduleCommit(d => {
      d.queue ??= [];
      const t = d.tables.find(tt => tt.a === loser || tt.b === loser);
      if (!t) return;
      if (t.a === loser) t.a = undefined;
      if (t.b === loser) t.b = undefined;
      d.queue = (d.queue ?? []).filter(x => {
        if (x === loser) return false;
        if (!isTeam(x)) return true;
        if (isTeam(loser)) return !teamMembers(x).some(id => teamMembers(loser).includes(id));
        return !teamMembers(x).includes(loser);
      });
      if (shouldQueue && !d.queue.includes(loser)) d.queue!.push(loser);
      excludeSeatPidRef.current = loser;
    });
  };

  /* UI */
  return (
    <ErrorBoundary>
      <main ref={pageRootRef} style={wrap}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
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
            <header style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginTop:6}}>
              <div>
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
                  <button style={btnGhostSm} onClick={()=>setShowHistory(v=>!v)}>{showHistory?"Hide":"Show"} history</button>
                </div>
              </div>
              <div style={{display:"grid",gap:6,justifyItems:"end"}}>
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
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
                      checked={!!doublesEnabled}
                      onChange={(e)=>{
                        const target = e.target as HTMLInputElement | null;
                        const next = !!target?.checked;
                        scheduleCommit(d=>{ d.doubles = next; });
                      }}
                      disabled={busy}
                    />
                    Enable doubles (teams of two)
                  </label>
                </div>
              )}

              <div style={{display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px,1fr))", gap:12}}>
                {g.tables.map((t,i)=>{
                  const Seat = ({side,label}:{side:"a"|"b";label:string})=>{
                    const pid = t[side];
                    return (
                      <div
                        draggable={!!pid && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && supportsDnD}
                        onDragStart={(e)=>pid && onDragStart(e,{type:"seat",table:i,side,pid})}
                        onDragOver={supportsDnD ? onDragOver : undefined}
                        onDrop={supportsDnD ? (e)=>handleDrop(e,{type:"seat",table:i,side,pid}) : undefined}
                        style={{minHeight:24,padding:"10px 12px",border:"1px dashed rgba(255,255,255,.25)",borderRadius:10,background:"rgba(56,189,248,.10)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8, boxShadow:"inset 0 1px 0 rgba(255,255,255,.08)"}}
                        title={supportsDnD ? "Drag from queue, players, or swap seats" : "Use Queue controls"}
                      >
                        <span style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={dragHandleMini} aria-hidden>⋮</span>
                          <span style={{opacity:.7,fontSize:12}}>{label}</span>
                          <span>{nameOf(pid)}</span>
                        </span>
                        {pid && ((me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) || pid===me.id) && <button style={btnMini} onClick={()=>iLost(pid)} disabled={busy}>Lost</button>}
                      </div>
                    );
                  };
                  return (
                    <div key={i} style={{ background:"#0b3a66", borderRadius:12, padding:"12px 14px", border:"1px solid rgba(56,189,248,.35)", display:"grid", gap:10 }}>
                      <div style={{ opacity:.9, fontSize:12, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span>{t.label==="9 foot"?"9-Foot Table":"8-Foot Table"} • Table {i+1}</span>
                        {doublesEnabled && <span style={pillBadge}>Doubles</span>}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',alignItems:'center',gap:10}}>
                        <div style={{display:'grid',gap:8}}>
                          <Seat side="a" label={doublesEnabled ? "Left team" : "Player"}/>
                        </div>
                        <div style={{opacity:.7,textAlign:'center',fontWeight:600}}>vs</div>
                        <div style={{display:'grid',gap:8}}>
                          <Seat side="b" label={doublesEnabled ? "Right team" : "Player"}/>
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
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <h3 style={{marginTop:0}}>Queue ({queue.length})</h3>
                {(me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && queue.length >= 2 && (
                  <button style={btnGhostSm} onClick={skipFirst} disabled={busy} title="Move #1 below #2">Skip first</button>
                )}
              </div>

              {doublesEnabled && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && players.length >= 2 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:10}}>
                  <div style={{opacity:.8,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                    <span style={dragHandleMini} aria-hidden>⋮</span>
                    Queue a doubles team:
                  </div>
                  <select value={teamA} onChange={(e)=>setTeamA(e.target.value)} style={select} disabled={busy}>
                    <option value="">Player A</option>
                    {players.map(p=>(<option key={`ta-${p.id}`} value={p.id}>{p.name}</option>))}
                  </select>
                  <select value={teamB} onChange={(e)=>setTeamB(e.target.value)} style={select} disabled={busy}>
                    <option value="">Player B</option>
                    {players.map(p=>(<option key={`tb-${p.id}`} value={p.id}>{p.name}</option>))}
                  </select>
                  <button
                    style={btnGhostSm}
                    onClick={addTeamToQueue}
                    disabled={busy || !teamA || !teamB || teamA===teamB}
                    title="Add two players as a team"
                  >Add doubles</button>
                </div>
              )}

              {queue.length===0 ? <div style={{opacity:.6,fontStyle:"italic"}}>Drop players here</div> : (
                <ol style={{margin:0,paddingLeft:18,display:"grid",gap:6}}
                    onDragOver={supportsDnD ? onDragOver : undefined}
                    onDrop={supportsDnD ? (e)=>handleDrop(e,{type:"queue",index:queue.length,pid:"__end" as any}) : undefined}>
                  {queue.map((pid,idx)=>{
                    const pref = (prefs[pid] ?? "any") as Pref;
                    const canEditSelf = pid===me.id;
                    return (
                      <li key={`${pid}-${idx}`}
                          draggable={supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id))}
                          onDragStart={supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) ? (e)=>onDragStart(e,{type:"queue",index:idx,pid}) : undefined}
                          onDragOver={supportsDnD ? onDragOver : undefined}
                          onDrop={supportsDnD ? (e)=>handleDrop(e,{type:"queue",index:idx,pid}) : undefined}
                          style={queueItem}>
                        <span style={dragHandle} aria-hidden>⋮⋮</span>
                        <span style={bubbleName} title={supportsDnD ? "Drag to reorder" : "Use arrows to reorder"}>
                          {idx+1}. {nameOf(pid)}
                        </span>

                        {!supportsDnD && (me.id === g.hostId || (g.cohosts ?? []).includes(me.id)) && (
                          <div style={{display:"flex",gap:4,marginRight:6}}>
                            <button style={btnTiny} onClick={()=>moveUp(idx)} disabled={busy || idx===0} aria-label="Move up">▲</button>
                            <button style={btnTiny} onClick={()=>moveDown(idx)} disabled={busy || idx===queue.length-1} aria-label="Move down">▼</button>
                          </div>
                        )}

                        <div style={{display:"flex",gap:6}}>
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
              <h3 style={{marginTop:0}}>List (Players) — {players.length}</h3>
              <div style={{opacity:.75,fontSize:13,marginBottom:8,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
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
            </section>
          </>
        )}
      </main>
      <DebugPanel/>
    </ErrorBoundary>
  );

  /* DnD helpers */
  type DragInfo =
    | { type: "seat"; table: number; side: "a"|"b"; pid?: string }
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
      const removeEverywhere = (pid: string) => { d.queue = (d.queue ?? []).filter(x => x !== pid); d.tables = d.tables.map(t => ({ ...t, a: t.a === pid ? undefined : t.a, b: t.b === pid ? undefined : t.b })); };
      const placeSeat = (ti: number, side: "a"|"b", pid?: string) => { if (!pid) return; removeEverywhere(pid); d.tables[ti][side] = pid; };

      if (target.type === "seat") {
        if (src.type === "seat") {
          const sp = d.tables[src.table][src.side], tp = d.tables[target.table][target.side];
          d.tables[src.table][src.side] = tp; d.tables[target.table][target.side] = sp;
        } else if (src.type === "queue") {
          d.queue = (d.queue ?? []).filter(x => x !== src.pid);
          placeSeat(target.table, target.side, src.pid);
        } else if (src.type === "player") {
          placeSeat(target.table, target.side, src.pid);
        }
      } else if (target.type === "queue") {
        if (src.type === "queue") d.queue = moveWithin(d.queue!, src.index, target.index);
        else if (src.type === "seat") { const pid = d.tables[src.table][src.side]; d.tables[src.table][src.side] = undefined; if (pid) d.queue!.splice(target.index, 0, pid); }
        else if (src.type === "player") { if (!d.queue!.includes(src.pid)) d.queue!.splice(target.index, 0, src.pid); }
      } else if (target.type === "bench") {
        if (src.type === "seat") { const pid = d.tables[src.table][src.side]; d.tables[src.table][src.side] = undefined; removeEverywhere(pid ?? ""); }
        if (src.type === "queue") { d.queue = (d.queue ?? []).filter(x => x !== src.pid); }
      }
    });
  }
}

/* ============ Styles ============ */
const wrap: React.CSSProperties = { minHeight:"100vh", background:"#0b0b0b", color:"#fff", padding:24, fontFamily:"system-ui", WebkitTouchCallout:"none" };
const card: React.CSSProperties = { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:14, padding:14, marginBottom:14 };
const btn: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"none", background:"#0ea5e9", color:"#fff", fontWeight:700, cursor:"pointer" };
const btnGhost: React.CSSProperties = { padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer" };
const btnGhostSm: React.CSSProperties = { padding:"6px 10px", borderRadius:10, border:"1px solid rgba(255,255,255,0.25)", background:"transparent", color:"#fff", cursor:"pointer", fontWeight:600 };
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

const bubbleName: React.CSSProperties = {
  flex: "1 1 auto",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px dashed rgba(255,255,255,.35)",
  background: "linear-gradient(120deg, rgba(255,255,255,.08), rgba(14,165,233,.08))",
  cursor: "grab",
  userSelect: "none",
  boxShadow: "0 4px 12px rgba(0,0,0,0.22)",
};
const queueItem: React.CSSProperties = {
  cursor:"grab",
  display:"flex",
  alignItems:"center",
  gap:10,
  justifyContent:"space-between"
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