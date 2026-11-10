#!/usr/bin/env bash
#
# 内容后台启动脚本。
#
# 知识库连接串来自 geo-platform 的后端 .env —— **不在本仓库存任何凭据**。
# 后台是只读的：它只 SELECT knowledge_items / knowledge_bases，不写。
#
# 用法：
#   scripts/run-admin.sh            # 正常启动（5105）
#   ADMIN_PORT=5205 scripts/run-admin.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GEO_K_ENV="${GEO_K_ENV:-/Users/xzmx/Downloads/my-project/geo-platform/apps/geo-knowledge/backend/.env}"

if [[ ! -f "$GEO_K_ENV" ]]; then
  echo "找不到 geo-knowledge 的 .env：$GEO_K_ENV" >&2
  echo "用 GEO_K_ENV=<路径> 指定，或手动导出 KNOWLEDGE_DATABASE_URL。" >&2
  exit 1
fi

# 只取 DATABASE_URL 一行 —— 不 source 整个 .env，避免带进无关变量
KNOWLEDGE_DATABASE_URL="$(
  grep -E '^DATABASE_URL=' "$GEO_K_ENV" | head -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//'
)"
export KNOWLEDGE_DATABASE_URL

if [[ -z "${KNOWLEDGE_DATABASE_URL:-}" ]]; then
  echo "$GEO_K_ENV 里没有 DATABASE_URL" >&2
  exit 1
fi

# Casdoor 鉴权配置（可选）—— .env.casdoor.local 已 gitignore，不进仓库。
# 存在就加载：后台自动开启登录；删掉它就是无鉴权的开发模式。
if [[ -f "$REPO_ROOT/.env.casdoor.local" ]]; then
  set -a
  source "$REPO_ROOT/.env.casdoor.local"
  set +a
  echo "▸ Casdoor 鉴权：已加载 .env.casdoor.local（回调 ${CASDOOR_REDIRECT_URI}）"
else
  echo "▸ Casdoor 鉴权：未配置（无 .env.casdoor.local）—— 后台无鉴权"
fi

# geo-kit 要先构建 —— 后台 import 的是 dist/
pnpm --filter @geokit/geo-kit build

cd "$REPO_ROOT"
exec node apps/admin/src/server.ts
