import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";

const nextConfig: NextConfig = {
  // 纯静态导出（ADR-000 决策 3）—— 客户站零服务器成本
  output: "export",
  images: {
    // 静态导出下需要自定义 loader 或关闭优化。
    // 客户站图片走 CDN/OSS，这里直接用原图更简单可控。
    unoptimized: true,
  },
  trailingSlash: true,
  // 客户站构建发生在 workspace 之外的临时目录（scripts/build-site.mjs），
  // turbopack 默认以 workspace 根为解析边界会报错，
  // 这里把 root 指向本目录的上级（构建目录的父级），让模块解析能覆盖到。
  turbopack: {
    root: resolve(dirname(new URL(import.meta.url).pathname), ".."),
  },
};

export default nextConfig;
