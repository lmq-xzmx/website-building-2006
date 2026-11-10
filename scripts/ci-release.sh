#!/bin/sh
# 发布准备：把 NAS 上已构建好的 sha 镜像重打 latest（复用构建产物，不重新编译）
set -e
exec 2>&1

# registry 地址由环境变量注入（agent / CI secret）—— 仓库里不写内网地址
REG=${REG:?缺少 REG（内网 registry 地址）}
TAG=${TAG:-${CI_COMMIT_SHA}}
IMAGE="$REG/website-building"

if [ -z "$TAG" ]; then
  echo "❌ 缺少 CI_COMMIT_SHA，无法定位镜像"
  exit 1
fi

echo "=== 拉取 sha 镜像并核验架构 ==="
docker pull --platform linux/amd64 "$IMAGE:$TAG"
ACTUAL="$(docker image inspect "$IMAGE:$TAG" --format '{{.Architecture}}/{{.Os}}')"
echo "镜像架构：$ACTUAL"
if [ "$ACTUAL" != "amd64/linux" ]; then
  echo "❌ 镜像不是 amd64/linux，中止发布"
  exit 1
fi

echo "=== 重打 latest ==="
docker tag "$IMAGE:$TAG" "$IMAGE:latest"
docker image rm "$IMAGE:latest" >/dev/null 2>&1 || true
docker tag "$IMAGE:$TAG" "$IMAGE:latest"
docker push --platform linux/amd64 "$IMAGE:latest"
echo "✅ latest 已指向 $TAG"
