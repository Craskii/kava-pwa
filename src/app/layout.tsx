// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

// Client components
import AlertsGlobal from "@/components/AlertsGlobal";
import LaunchReminder from "@/components/LaunchReminder";
import ClientErrorTrap from "@/components/ClientErrorTrap";

// SW + update toast wrapper
import ClientBoot from "./ClientBoot";
// OneSignal init (background push)
import OneSignalBoot from "./OneSignalBoot";

export const metadata: Metadata = {
  title: "Kava Tournaments",
  description: "Create brackets and list games with live alerts.",
  applicationName: "Kava",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* PWA meta */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* (Optional) Keep the old one if you want, but it’s deprecated. You can remove it. */}
        {/* <meta name="apple-mobile-web-app-capable" content="yes" /> */}

        {/* Recommended extras */}
        <meta name="theme-color" content="#0b0b0b" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <title>Kava</title>
      </head>
      <body>{children}</body>
    </html>
  );
}