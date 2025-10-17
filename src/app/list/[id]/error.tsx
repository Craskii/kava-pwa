'use client';
export default function ErrorBoundary() {
  return (
    <main style={{ minHeight:'100vh', background:'#0b0b0b', color:'#fff', padding:24, fontFamily:'system-ui' }}>
      <a href="/lists" style={{ color:'#38bdf8' }}>← Back</a>
      <h2>Something went wrong loading this list.</h2>
      <p style={{ opacity:.8 }}>Try refreshing or go back to My lists.</p>
    </main>
  );
}
