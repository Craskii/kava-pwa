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
        {/* iOS A2HS extras */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      </head>
      <body>
        {/* ✅ Global error trap so platform overlay never replaces UI */}
        <ClientErrorTrap />

        {/* Global in-app banners + launch reminder */}
        <AlertsGlobal />
        <LaunchReminder />

        {/* 🔔 OneSignal boot (Option A background push) */}
        <OneSignalBoot />

        {/* ✅ SW register + update toast wrapper */}
        <ClientBoot>{children}</ClientBoot>
      </body>
    </html>
  );
}
