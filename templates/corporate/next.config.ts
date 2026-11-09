import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯静态导出（ADR-000 决策 3）—— 客户站零服务器成本
  output: "export",
  images: {
    // 静态导出下需要自定义 loader 或关闭优化。
    // 客户站图片走 CDN/OSS，这里直接用原图更简单可控。
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
