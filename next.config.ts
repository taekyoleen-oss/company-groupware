import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  // 자주 쓰이는 named import 의 트리쉐이킹/배럴 최적화. UI/동작 영향 없음.
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
};

export default nextConfig;
