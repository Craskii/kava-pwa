declare module 'next-pwa' {
  import type { NextConfig } from 'next';

  type NextPWAOptions = {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean | string;
    // add any other options you need later
  };

  // default export is a function that returns a Next.js config wrapper
  export default function withPWA(options?: NextPWAOptions):
    (nextConfig?: NextConfig) => NextConfig;
}
