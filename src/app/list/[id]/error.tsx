'use client';

export default function ListError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = String(error?.message ?? error ?? 'Unknown error');
  const stack = (error as any)?.stack ? String((error as any).stack) : '';

  return (
    <div
      style={{
        padding: 20,
        background: '#3b0d0d',
        border: '1px solid #7f1d1d',
        borderRadius: 12,
        color: '#fff',
        fontFamily: 'monospace',
      }}
    >
      <b>Couldn’t load this list page.</b>
      <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <div>
          <i>Message:</i> {msg}
        </div>
        {error?.digest && (
          <div style={{ marginTop: 6 }}>
            <i>Digest:</i> {error.digest}
          </div>
        )}
        {stack && (
          <div style={{ marginTop: 10 }}>
            <i>Stack:</i>
            {'\n'}
            {stack}
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: '#0ea5e9',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Try again
        </button>
        <a
          href="/lists"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
