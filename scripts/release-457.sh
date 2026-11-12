#!/bin/sh
# website-building 生产发布 —— 在 457 上跑（x86_64，产出天然是 linux/amd64）。
#
# 流程：
#   1. 拉最新代码（GitHub SSH，**只快进**，不丢弃本地改动）
#   2. 同步宿主编排产物进构建上下文
#   3. 构建 amd64 镜像（本地 build，不跨平台 —— 457 本身就是 x86_64）
#   4. 推内网 registry
#   5. compose pull && up -d
#   6. 验证
#
# ⚠️ 所有内网地址与密钥来自环境变量 / 宿主上的 .env，脚本本身不含敏感值。
#
# 用法：
#   REG=<内网 registry> SRC=<源码目录> sh scripts/release-457.sh
set -e
exec 2>&1

REG=${REG:?缺少 REG（内网 registry 地址）}
SRC=${SRC:?缺少 SRC（源码目录）}
DEPLOY_DIR=${DEPLOY_DIR:-/data/website-building}
SECRETS=${SECRETS:-/data/secrets/wb.env}
SITES_DIR=${SITES_DIR:-/data/website-building/sites}
IMAGE="$REG/website-building"

echo "════ 1. 平台自检 ════"
ARCH="$(uname -m)"
if [ "$ARCH" != "x86_64" ]; then
  echo "❌ 构建机是 $ARCH，本镜像必须 linux/amd64，中止"
  exit 1
fi
echo "  $ARCH ✓"

echo "════ 2. 拉代码（只快进）════"
cd "$SRC"
if [ -d .git ]; then
  git fetch origin main
  # 有本地改动就不动 —— 不丢别人的东西
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "  ⚠️ 工作区有未提交改动，跳过拉取（用现有代码构建）"
    git status --short | head -5
  else
    git merge --ff-only origin/main
    echo "  已同步到 $(git rev-parse --short HEAD)"
  fi
else
  echo "  ⚠️ $SRC 不是 git 仓库，跳过拉取（用现有代码构建）"
fi
TAG=$(cd "$SRC" && git rev-parse --short HEAD 2>/dev/null || echo manual)

echo "════ 3. 同步宿主编排产物 ════"
# 后台写的编排产物在宿主卷里，不在源码目录 —— 不同步进构建上下文，
# 模块编排内容与外观配置都不会进站。
for site in "$SITES_DIR"/*/; do
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
  # 素材也要带 —— 后台上传的图落在宿主卷的 public/media/，
  # 不同步的话构建产物里没有 media/ 目录，
  # 发布后的前台引用 /media/<file> 就是 404（后台缩略图却能显示，
  # 因为那条走后端接口 —— 两边表现不一致，很难查）。
  if [ -d "$site/public/media" ]; then
    mkdir -p "$SRC/sites/$name/public/media"
    cp -r "$site/public/media/." "$SRC/sites/$name/public/media/" 2>/dev/null || true
    n=$(ls -1 "$SRC/sites/$name/public/media" 2>/dev/null | wc -l | tr -d ' ')
    [ "$n" != "0" ] && brought="$brought 素材${n}个"
  fi
  if [ -n "$brought" ]; then
    echo "  $name: 已带入$brought"
  else
    echo "  $name: 无编排产物（只有手写内容）"
  fi
done

echo "════ 4. 构建镜像 ════"
cd "$SRC"
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

ACTUAL="$(docker image inspect "$IMAGE:$TAG" --format '{{.Architecture}}/{{.Os}}')"
echo "  镜像架构：$ACTUAL"
if [ "$ACTUAL" != "amd64/linux" ]; then
  echo "❌ 镜像不是 amd64/linux，禁止推送"
  exit 1
fi

echo "════ 5. 推 registry ════"
docker push --platform linux/amd64 "$IMAGE:$TAG"
docker push --platform linux/amd64 "$IMAGE:latest"

echo "════ 6. 部署 ════"
cd "$DEPLOY_DIR"
export WB_REGISTRY="$REG"
export WB_IMAGE_TAG="$TAG"
export WB_SITES_DIR="$SITES_DIR"
export WB_SECRETS_FILE="$SECRETS"
docker compose pull
docker compose up -d

echo "════ 7. 验证 ════"
sleep 12
echo "--- 容器状态 ---"
docker ps --filter name=wb-app --format '{{.Names}}  {{.Status}}  {{.Ports}}'
echo "--- 静态站 3019 ---"
curl -s -o /dev/null -w "  http://127.0.0.1:3019/ → %{http_code}\n" http://127.0.0.1:3019/
echo "--- 后台 3020 ---"
curl -s -o /dev/null -w "  http://127.0.0.1:3020/healthz → %{http_code}\n" http://127.0.0.1:3020/healthz
echo "--- /admin 反代（本次新增）---"
curl -s -o /dev/null -w "  http://127.0.0.1:3019/admin → %{http_code}\n" http://127.0.0.1:3019/admin
echo "--- /oauth2 回调路径 ---"
curl -s -o /dev/null -w "  http://127.0.0.1:3019/oauth2/callback → %{http_code}\n" http://127.0.0.1:3019/oauth2/callback
echo "--- 首页标题 ---"
curl -s http://127.0.0.1:3019/ | grep -o "<title>[^<]*</title>" | head -1

echo ""
echo "✅ 发布完成：$IMAGE:$TAG"
echo "   公网静态站：3019   后台（带 Casdoor 登录）：3019/admin"
