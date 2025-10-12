export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function BarsPage(props: Props) {
  // ✅ guard against undefined during prerender
  const listId = (props?.searchParams?.listId as string) || '';
  // ...your original UI, safely using listId (or leaving it blank)...
  return (
    <main style={{ minHeight: '100vh', background: '#0b0b0b', color: '#fff', padding: 24 }}>
      <h1 style={{ margin: '8px 0 12px' }}>Nearby Bars</h1>
      {listId ? <div style={{ opacity: .8, fontSize: 13 }}>For list: {listId}</div> : null}
      {/* TODO: put your previous bars UI back here */}
    </main>
  );
}
