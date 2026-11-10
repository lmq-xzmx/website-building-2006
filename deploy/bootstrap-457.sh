#!/bin/sh
# website-building 生产机一次性初始化：部署资产就位。
# 幂等：重复执行安全。
#
# ⚠️ 本脚本**不建库、不改生产库权限** —— website-building 只读知识库，
#    用现成的 geo_knowledge 库与账号，不需要新角色。
#    （建库/GRANT 属于改生产库权限，须由用户手工执行。）
#
# ⚠️ 脚本里**不含内网地址** —— registry、部署机 IP、密钥路径全部由环境变量
#    注入（默认值是占位）。仓库可以公开，敏感值留在目标机。
#
# 用法：
#   WB_REGISTRY=<内网 registry> WB_DEPLOY_DIR=<部署目录> \
#   WB_SECRETS=<密钥文件路径> sh deploy/bootstrap-457.sh
set -e

WB_REGISTRY=${WB_REGISTRY:-registry.internal:5000}
WB_DEPLOY_DIR=${WB_DEPLOY_DIR:-/data/website-building}
WB_SECRETS=${WB_SECRETS:-/data/secrets/wb.env}
WB_SITE_PORT=${WB_SITE_PORT:-3019}
WB_ADMIN_PORT=${WB_ADMIN_PORT:-3020}
PG_CONTAINER=${PG_CONTAINER:-WeKnora-postgres}
PG_DB=${PG_DB:-geo_knowledge}
PG_USER=${PG_USER:-postgres}

echo "== 1. 部署目录 =="
mkdir -p "$WB_DEPLOY_DIR"
echo "  $WB_DEPLOY_DIR 就绪"

echo "== 2. 编排文件 =="
if [ -f "$WB_DEPLOY_DIR/docker-compose.yml" ]; then
  echo "  已存在，跳过（要更新请手工替换）"
else
  cat > "$WB_DEPLOY_DIR/docker-compose.yml" <<EOF
services:
  website-building:
    image: \${WB_REGISTRY:-$WB_REGISTRY}/website-building:\${WB_IMAGE_TAG:-latest}
    container_name: wb-app
    restart: unless-stopped
    ports:
      - "\${WB_SITE_PORT:-$WB_SITE_PORT}:8080"
      - "127.0.0.1:\${WB_ADMIN_PORT:-$WB_ADMIN_PORT}:5105"
    env_file:
      - \${WB_SECRETS_FILE:-$WB_SECRETS}
    environment:
      ADMIN_HOST: 0.0.0.0
      ADMIN_PORT: "5105"
      SITES_DIR: /srv/app/sites
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:5105/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
EOF
  echo "  compose 已写入"
fi

echo "== 3. 密钥文件 =="
mkdir -p "$(dirname "$WB_SECRETS")"
if [ -f "$WB_SECRETS" ]; then
  echo "  已存在，跳过（如需重置请手工处理）"
else
  umask 077
  cat > "$WB_SECRETS" <<EOF
# website-building 生产配置
#
# KNOWLEDGE_DATABASE_URL —— 后台**只读**接入 geo_knowledge 库。
#   宿主 PG 在 127.0.0.1:5433（业务大实例），
#   容器内要用 host.docker.internal。
#   ⚠️ 本文件含口令，权限必须 600，不要提交进仓库。
KNOWLEDGE_DATABASE_URL=KNOWLEDGE_DATABASE_URL_PLACEHOLDER
WB_REGISTRY=$WB_REGISTRY
WB_IMAGE_TAG=latest
EOF
  chmod 600 "$WB_SECRETS"
  echo "  模板已写入（600）—— 请手工填入 KNOWLEDGE_DATABASE_URL"
fi

echo "== 4. 知识库可达性自检 =="
if docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT count(*) FROM knowledge_items" >/dev/null 2>&1; then
  COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
    "SELECT count(*) FROM knowledge_items" 2>/dev/null | tr -d ' \n')
  echo "  $PG_DB 可达，knowledge_items 当前 $COUNT 条"
else
  echo "  ⚠️ 读不到 $PG_DB —— 检查容器名/账号（$PG_CONTAINER / $PG_USER）"
fi

echo "== 完成。容器待首个镜像推上 registry 后由 CI 或手工 pull 启动 =="
