import SWRegister from './sw-register';
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "🏓 Kava Tournaments",
  description: "Create tournaments, queues & get turn alerts.",
  manifest: "/manifest.webmanifest", // ← fix path & extension
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kava Tournaments" },
  icons: {
    icon: "/icons/icon-192.png",              // keep these filenames consistent with your /public/icons/*
    apple: "/icons/icon-192.png",
    shortcut: "/icons/icon-512.png",
  },
};
// 👇 New per Next 15
export const viewport: Viewport = {
  themeColor: "#0ea5e9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SWRegister />
        {children}
      </body>
    </html>
  );
}
