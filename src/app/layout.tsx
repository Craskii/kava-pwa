// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import AlertsGlobal from "@/components/AlertsGlobal";

export const metadata: Metadata = {
  title: "Kava Tournaments",
  description: "Create brackets and list games with live alerts.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  themeColor: "#0b0b0b",
  applicationName: "Kava",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Extra safety for iOS homescreen icon */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      </head>
      <body>
        {/* Global client-side alert plumbing (Notification + banner pings) */}
        <AlertsGlobal />
        {children}
      </body>
    </html>
  );
}
