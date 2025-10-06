// src/app/manifest.webmanifest/route.ts
import { NextResponse } from "next/server";

export function GET() {
  const manifest = {
    name: "Kava Tournaments",
    short_name: "Kava",
    description: "Create tournaments, queues & get turn alerts.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0ea5e9",
    icons: [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  // iOS sometimes uses this maskable style too:
  { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any maskable" },
],
    shortcuts: [
      { name: "Create Tournament", short_name: "Create", url: "/tournaments/new" },
      { name: "Join Queue", short_name: "Join", url: "/queues/join" },
      { name: "Kava Bar List", short_name: "Bars", url: "/bars" },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
