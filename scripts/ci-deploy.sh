#!/bin/sh
# website-building 部署：把镜像部署到生产机
#
# 模型与 geo-platform / cn-math-taxonomy 一致：
#   **编排文件在目标机上就位，CI 只做 pull && up -d**。
#
# 环境变量：
#   KEY          部署私钥路径（agent 挂进步骤容器）
#   DEPLOY_HOST  目标机地址
#   DEPLOY_DIR   目标机上的部署目录
#   WB_SITE_PORT / WB_ADMIN_PORT  目标机上的端口
#
# ⚠️ 目标机地址与目录由环境变量注入 —— 仓库里不写内网地址。
set -e
exec 2>&1

KEY=${KEY:?缺少 KEY（部署私钥路径）}
DEPLOY_HOST=${DEPLOY_HOST:?缺少 DEPLOY_HOST（目标机地址）}
DEPLOY_DIR=${DEPLOY_DIR:?缺少 DEPLOY_DIR（目标机部署目录）}
WB_SITE_PORT=${WB_SITE_PORT:-3019}
WB_ADMIN_PORT=${WB_ADMIN_PORT:-3020}
SSH_OPTS="-n -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15 -i $KEY"

if [ ! -r "$KEY" ]; then
  echo "❌ 找不到部署私钥 $KEY（agent 未挂载或路径不对）"
  exit 1
fi

echo "=== 部署到 $DEPLOY_HOST:$DEPLOY_DIR ==="
ssh $SSH_OPTS "root@$DEPLOY_HOST" "cd '$DEPLOY_DIR' && docker compose pull && docker compose up -d"

echo ""
echo "--- 部署完成，当前状态"
ssh $SSH_OPTS "root@$DEPLOY_HOST" "cd '$DEPLOY_DIR' && docker compose ps" 2>&1 | tail -8

echo ""
echo "--- 健康检查"
ssh $SSH_OPTS "root@$DEPLOY_HOST" "sleep 5; curl -fsS --max-time 10 http://127.0.0.1:$WB_SITE_PORT/ >/dev/null && echo '  静态站 $WB_SITE_PORT OK'; curl -fsS --max-time 10 http://127.0.0.1:$WB_ADMIN_PORT/healthz && echo"
echo "✅ 部署完成"
