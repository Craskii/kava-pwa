// src/app/lists/error.tsx
'use client';

export default function ListsError(
  { error, reset }: { error: Error & { digest?: string }, reset: () => void }
) {
  const msg = String(error?.message ?? error ?? 'Unknown error');
  const stack = (error as any)?.stack ? String((error as any).stack) : '';
  return (
    <div style={{padding:16, background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:8}}>
      <b>Couldn’t load your lists.</b>
      <div style={{opacity:.85, marginTop:6, fontSize:12, whiteSpace:'pre-wrap', wordBreak:'break-word'}}>
        <div><i>Message:</i> {msg}</div>
        {error?.digest && <div style={{marginTop:6}}><i>Digest:</i> {error.digest}</div>}
        {stack && <div style={{marginTop:10}}><i>Stack:</i>{'\n'}{stack}</div>}
      </div>
      <div style={{marginTop:10, display:'flex', gap:8}}>
        <button onClick={() => reset()} style={{padding:'8px 12px',borderRadius:10,border:'none',background:'#0ea5e9',color:'#fff',fontWeight:700,cursor:'pointer'}}>Retry</button>
        <a href="/" style={{padding:'8px 12px',borderRadius:10,border:'1px solid rgba(255,255,255,.25)',color:'#fff',textDecoration:'none'}}>Go home</a>
      </div>
    </div>
  );
}
