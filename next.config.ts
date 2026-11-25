import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 브라우저 코드가 배포 종류를 알 수 있게 빌드할 때 넣는다(Vercel: production | preview, 로컬: development).
  // here-dev는 Preview라 NODE_ENV만으로는 운영과 구분되지 않는다. 비밀값이 아니다.
  env: { HERE_DEPLOY_ENV: process.env.VERCEL_ENV ?? "development" },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
