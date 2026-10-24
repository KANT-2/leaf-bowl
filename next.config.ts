import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // FastAPI 백엔드(backend/)는 /backend 아래로 프록시한다. 기존 Next.js API(/api/v1/orders 등)와 경로가 겹치지 않고,
  // 같은 도메인이라 CORS 가 필요 없다. 주소는 next.config 를 읽는 빌드·기동 시점의 BACKEND_URL 을 쓴다.
  async rewrites() {
    const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    return [{ source: "/backend/:path*", destination: `${backend}/:path*` }];
  },
  // 예전 정적 bowl match 주소는 앱 안의 /match 로 보낸다.
  async redirects() {
    return [
      { source: "/bowl-match", destination: "/match", permanent: true },
      { source: "/bowl-match/:path*", destination: "/match", permanent: true },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
