'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  console.error('Global Error:', error);
  return (
    <html>
      <body style={{minHeight:'100vh',background:'#0b0b0b',color:'#fff',fontFamily:'system-ui',display:'grid',placeItems:'center',padding:24}}>
        <div style={{maxWidth:600, background:'#3b0d0d', border:'1px solid #7f1d1d', borderRadius:12, padding:16}}>
          <h2 style={{marginTop:0}}>Something went wrong</h2>
          <div style={{opacity:.8, fontSize:13, margin:'6px 0 12px'}}>
            Open DevTools → Console to see the exact stack trace.
          </div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button onClick={() => reset()} style={{padding:'8px 12px',borderRadius:10,border:'none',background:'#0ea5e9',color:'#fff',fontWeight:700,cursor:'pointer'}}>Try again</button>
            <a href="/" style={{padding:'8px 12px',borderRadius:10,border:'1px solid rgba(255,255,255,.25)',color:'#fff',textDecoration:'none'}}>Go home</a>
          </div>
        </div>
      </body>
    </html>
  );
}
