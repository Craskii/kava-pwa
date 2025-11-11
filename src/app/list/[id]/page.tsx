cd "C:\Users\henri\kava-pwa"

Set-Content -Path "src/app/list/[id]/page.tsx" -Value @'
export const runtime = "edge"; // Cloudflare Pages needs Edge here

import ListClient from "./ListClient";

export default function Page() {
  // Server component wrapper that renders the client-only UI.
  return <ListClient />;
}
'@
