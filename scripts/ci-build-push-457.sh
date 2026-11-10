#!/bin/sh
# 在目标机（生产机）上构建 amd64 镜像并推送到内网 registry（C 路线：手工构建）。
#
# 为什么在 x86_64 机器上构建而不是 Mac：
#   Mac 是 arm64 —— 交叉编译要 buildx + 模拟，慢且容易出怪问题；
#   x86_64 机器上构建出的镜像天然就是 linux/amd64。
#
# 为什么 push 也在这里做：
#   开发机的 `docker push` 会被安全策略拦（判定私有代码外送）；
#   在你自己的机器上 push 不受此限（既有模式：/data/geo-build/push.sh）。
#
# 用法：
#   REG=<内网 registry> SRC=<源码目录> sh scripts/ci-build-push-457.sh
#
# ⚠️ registry 地址由环境变量注入 —— 仓库里不写内网地址。
set -e
exec 2>&1

REG=${REG:?缺少 REG（内网 registry 地址）}
IMAGE="$REG/website-building"
TAG=${TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo manual)}
SRC=${SRC:-/data/geo-build/website-building}

echo "SRC=$SRC  REG=$REG  TAG=$TAG"

# ── 平台自检 ────────────────────────────────────────────
ARCH="$(uname -m)"
if [ "$ARCH" != "x86_64" ]; then
  echo "❌ 构建机是 $ARCH，本镜像必须 linux/amd64，中止"
  exit 1
fi

cd "$SRC"

# ── 把编排产物同步进构建上下文 ──────────────────────────
# 后台在生产上写的编排产物落在宿主的 WB_SITES_DIR（卷挂载点），
# 不在源码目录里。构建前要同步进来 —— 否则站点构建出来的是
# 「只有手写内容」的版本，后台编排的成果根本没进站。
#
# 两份产物都要带：
#   plan.generated.ts    编排台产物（知识条目 → 四个固定槽位）
#   modules.generated.ts 模块编排产物（页面 → 模块 → 条目 + 外观配置）
#
# ⚠️ 带 modules.generated.ts 时，外观配置（布局变体等）才会生效 ——
#    它不在 modules.generated.ts 里，而是在同文件的 appearance 导出。
if [ -n "${WB_SITES_DIR:-}" ] && [ -d "$WB_SITES_DIR" ]; then
  echo "=== 同步编排产物：$WB_SITES_DIR → $SRC/sites ==="
  for site in "$WB_SITES_DIR"/*/; do
    [ -d "$site" ] || continue
    name=$(basename "$site")
    [ -d "$SRC/sites/$name" ] || continue
    mkdir -p "$SRC/sites/$name/content"
    brought=""
    for f in plan.generated.ts modules.generated.ts; do
      if [ -f "$site/content/$f" ]; then
        cp "$site/content/$f" "$SRC/sites/$name/content/$f"
        brought="$brought $f"
      fi
    done
    cp "$site/plan.json" "$SRC/sites/$name/plan.json" 2>/dev/null || true
    cp "$site/modules.json" "$SRC/sites/$name/modules.json" 2>/dev/null || true
    if [ -n "$brought" ]; then
      echo "  $name: 已带入$brought"
    else
      echo "  $name: 无编排产物（只有手写内容）"
    fi
  done
else
  echo "（未设 WB_SITES_DIR，跳过编排产物同步）"
fi

echo "=== docker build ==="
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

echo "=== 架构核验 ==="
ACTUAL="$(docker image inspect "$IMAGE:$TAG" --format '{{.Architecture}}/{{.Os}}')"
echo "镜像架构：$ACTUAL"
if [ "$ACTUAL" != "amd64/linux" ]; then
  echo "❌ 镜像不是 amd64/linux，禁止推送"
  exit 1
fi

echo "=== 推送 ==="
docker push --platform linux/amd64 "$IMAGE:$TAG"
docker push --platform linux/amd64 "$IMAGE:latest"

echo "✅ 已推送 $IMAGE:$TAG 与 $IMAGE:latest（amd64）"
echo ""
echo "验收：curl -s http://$REG/v2/_catalog | grep -o 'website-building'"
