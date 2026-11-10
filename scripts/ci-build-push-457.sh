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
