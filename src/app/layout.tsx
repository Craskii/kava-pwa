import SWRegister from './sw-register'; // 👈 This stays at the top

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kava Tournaments", // 👈 You can rename this now
  description: "Queue + brackets for kava bars",
  manifest: "/manifest.json", // 👈 add this line
  themeColor: "#0ea5e9", // 👈 add this line
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" }, // 👈 optional for iOS
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* 👇 This is the important part */}
        <SWRegister />
        {children}
      </body>
    </html>
  );
}
