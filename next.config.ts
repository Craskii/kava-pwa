// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip ESLint in CI/build so Cloudflare doesn't fail on stylistic rules
  eslint: {
    ignoreDuringBuilds: true,
  },
  // (optional) keep TypeScript build strictness if you’d like
  typescript: {
    // Set to true if your build fails on type errors you want to ignore during build
    // ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: [],
  },
};

export default nextConfig;
