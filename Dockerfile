# 生产镜像（linux/amd64，由 NAS 构建机产出，Mac 不构建）。
#
# 单容器两件事：
#   1. 静态站 —— nginx 托管 Next.js 静态导出产物（纯 HTML/CSS/JS）
#   2. 内容后台 —— Node 服务，读知识库、写 plan.json
#
# 为什么合成一个镜像：
#   后台要写 sites/ 目录里的 plan.json，静态站要读同一份内容构建出来的产物。
#   分两个镜像就得共享一个卷，编排复杂度翻倍，收益为零。
#
# 端口：
#   8080  静态站（容器内 nginx）
#   5105  内容后台（容器内 node）
# 宿主端口由 deploy/docker-compose.yml 映射到 3100 段。
#
# ⚠️ 基础镜像必须用**公开**镜像：内网 registry 对 buildkit 的 HEAD 请求回 401，
#    FROM 内网仓库会挂在拉取元数据这一步（cn-math-taxonomy 实测）。

# ── 阶段 1：构建静态站 ──────────────────────────────────
# 用 node 构建，用 nginx 运行 —— 产物是纯静态文件。
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# 先装依赖层（lockfile 不变时缓存命中）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/geo-kit/package.json packages/geo-kit/
COPY templates/corporate/package.json templates/corporate/
COPY sites/demo-saas/package.json sites/demo-saas/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile --ignore-scripts

# 源码
COPY packages packages
COPY templates templates
COPY sites sites
COPY scripts scripts
COPY apps apps

# 构建核心库 → 编译后台 → 生成 GEO 产物 → 构建客户站
RUN pnpm --filter @geokit/geo-kit build \
 && pnpm --filter @geokit/admin build \
 && pnpm --filter @geokit/site-demo-saas build

# ── 阶段 2：运行镜像 ────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# nginx 托管静态站
RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/app

# ── 后台依赖 ────────────────────────────────────────────
# 不能直接 COPY builder 的 node_modules —— pnpm 用符号链接指向
# 根目录的 .pnpm store，COPY 过去全是断链。
# 所以 runtime 阶段用 npm 独立装一份（只有两个依赖：pg + geo-kit）。
COPY --from=builder /app/packages/geo-kit/package.json packages/geo-kit/
COPY --from=builder /app/packages/geo-kit/dist packages/geo-kit/dist
COPY --from=builder /app/apps/admin/package.json apps/admin/

RUN cd /srv/app/apps/admin \
 && npm pkg set dependencies.@geokit/geo-kit="file:../../packages/geo-kit" \
 && npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/apps/admin/src apps/admin/src
COPY --from=builder /app/apps/admin/dist apps/admin/dist

# 站点目录 —— 后台要写 plan.json
# 只拷 demo-saas 一个站（sites/ 下每个站都带 node_modules 与 out，
# 整个拷进来会让镜像白白大几百 MB）
COPY --from=builder /app/sites/demo-saas/content sites/demo-saas/content
COPY --from=builder /app/sites/demo-saas/public sites/demo-saas/public

# 静态站产物
COPY --from=builder /app/sites/demo-saas/out /srv/app/site

# nginx 配置
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# 站点目录可写 —— 后台要写 plan.json
RUN mkdir -p /srv/app/sites && chmod -R u+w /srv/app/sites

ENV ADMIN_HOST=0.0.0.0 \
    ADMIN_PORT=5105 \
    SITES_DIR=/srv/app/sites \
    NODE_ENV=production

EXPOSE 8080 5105

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5105/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# nginx 前台运行（容器主进程），后台用 supervisor 风格的小包装器一起拉起
CMD ["sh", "-c", "node apps/admin/dist/server.js & exec nginx -g 'daemon off;'"]
