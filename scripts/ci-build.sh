#!/bin/sh
# website-building 镜像构建与推送（CI 用，NAS 构建机）
#
# 产物：$REG/website-building，tag = commit sha + latest
# 本项目构建不依赖任何私有仓库（静态站 + Node 后台），无需 Gitea token。
set -e
# stderr 并入 stdout：Woodpecker 的 log_entries 只存 stdout
exec 2>&1

# registry 地址由环境变量注入（agent / CI secret）—— 仓库里不写内网地址
REG=${REG:?缺少 REG（内网 registry 地址，如 100.x.x.x:5000）}
TAG=${TAG:-${CI_COMMIT_SHA}}
IMAGE="$REG/website-building"

echo "REG=$REG  TAG=$TAG"

# ── 平台自检：本镜像只允许在 NAS 原生 x86_64 上产出 ──
ARCH="$(uname -m)"
if [ "$ARCH" != "x86_64" ]; then
  echo "❌ 构建机是 $ARCH，本镜像必须 linux/amd64，中止"
  exit 1
fi

echo "=== docker build（多阶段：node 构建 → nginx 运行）==="
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

echo "=== 架构核验（push 前必须确认 amd64）==="
ACTUAL="$(docker image inspect "$IMAGE:$TAG" --format '{{.Architecture}}/{{.Os}}')"
echo "镜像架构：$ACTUAL"
if [ "$ACTUAL" != "amd64/linux" ]; then
  echo "❌ 镜像不是 amd64/linux，禁止推送"
  exit 1
fi

echo "=== 推送（--platform 钉死 amd64）==="
docker push --platform linux/amd64 "$IMAGE:$TAG"
docker push --platform linux/amd64 "$IMAGE:latest"

echo "✅ 已推送 $IMAGE:$TAG 与 $IMAGE:latest（amd64）"
