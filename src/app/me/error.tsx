// src/app/me/error.tsx
'use client';

export default function MeError({ reset }: { reset: () => void }) {
  return (
    <div style={{
      margin:'40px auto', maxWidth:560, background:'rgba(127,29,29,.25)',
      border:'1px solid rgba(248,113,113,.35)', borderRadius:12, padding:16, color:'#fff'
    }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>Something went wrong</div>
      <div style={{ opacity:.85, fontSize:13, marginBottom:10 }}>
        Open DevTools → Console to see the exact stack trace.
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={reset} style={{
          padding:'10px 14px', borderRadius:10, border:'none',
          background:'#0ea5e9', color:'#fff', fontWeight:700, cursor:'pointer'
        }}>
          Try again
        </button>
        <a href="/" style={{
          padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.25)',
          background:'transparent', color:'#fff', textDecoration:'none'
        }}>
          Go home
        </a>
      </div>
    </div>
  );
}
