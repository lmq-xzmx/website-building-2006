#!/bin/sh
# 生产上线验收 —— 在 457 上跑（部署后验证）。
#
# 检查项对应本次上线的四个新能力：
#   1. Casdoor 登录（/oauth2/callback 与 /admin 的鉴权行为）
#   2. 模块编排内容进站（/solutions 之类的模块页面）
#   3. 布局变体生效（html 标签上的 data-layout）
#   4. 后台 API 鉴权（未登录 401）
set -e
exec 2>&1

BASE=${BASE:-http://127.0.0.1:3019}
ADMIN=${ADMIN:-http://127.0.0.1:3020}

echo "════ 1. 容器与端口 ════"
docker ps --filter name=wb-app --format '  {{.Names}}  {{.Status}}  {{.Ports}}'

echo ""
echo "════ 2. 静态站 ════"
printf "  /              → %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
printf "  /llms.txt      → %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/llms.txt")"
printf "  /sitemap.xml   → %s\n" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/sitemap.xml")"
echo "  首页标题：$(curl -s "$BASE/" | grep -o '<title>[^<]*</title>' | head -1)"

echo ""
echo "════ 3. 后台健康 ════"
printf "  %s/healthz → %s\n" "$ADMIN" "$(curl -s -o /dev/null -w '%{http_code}' "$ADMIN/healthz")"
echo "  $(curl -s "$ADMIN/healthz")"

echo ""
echo "════ 4. Casdoor 登录链路 ════"
printf "  %s/admin            → %s（302=跳登录，未登录 ✓）\n" \
  "$BASE" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"
printf "  %s/oauth2/callback  → %s\n" \
  "$BASE" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/oauth2/callback")"
printf "  %s/api/sites        → %s（401=鉴权生效 ✓）\n" \
  "$BASE" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/sites")"
echo "  登录页跳转目标："
curl -s -o /dev/null -w "    %{redirect_url}\n" "$BASE/admin"

echo ""
echo "════ 5. 模块编排内容 ════"
echo "  站点上的模块页面（从 sitemap 找）："
# sitemap 里是**公网绝对地址**（客户域名）—— 生产机通常解析不了外网域名，
# 直接 curl 会得到 exit 6（could not resolve host），把整个验收脚本带崩。
# 这里把 host 换成本机的 BASE，只测路径。
curl -s "$BASE/sitemap.xml" | grep -o "<loc>[^<]*</loc>" | sed 's/<[^>]*>//g' | while read -r u; do
  case "$u" in
    */products*|*/cases*|*/insights*|*/about*|*/faq*|*/contact*) continue ;;
  esac
  local_u=$(printf '%s' "$u" | sed "s|^https\{0,1\}://[^/]*|$BASE|")
  code=$(curl -s -o /dev/null -w '%{http_code}' "$local_u" || echo "000")
  echo "    $code  $local_u"
done

echo ""
echo "════ 6. 布局变体 ════"
echo "  html 标签属性："
curl -s "$BASE/" | grep -o "<html[^>]*>" | head -1 | sed 's/^/    /'
echo "  布局 CSS 是否注入："
if curl -s "$BASE/" | grep -q "data-layout"; then
  echo "    ✓ 有 data-layout"
else
  echo "    ⚠️ 无 data-layout（可能是未启用布局变体）"
fi

echo ""
echo "════ 7. 编排产物持久化 ════"
ls -la /data/website-building/sites/demo-saas/content/ | sed 's/^/  /'
