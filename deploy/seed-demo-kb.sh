#!/bin/sh
# 灌一套**示范知识库**到生产的 geo_knowledge（测试与体验用）。
#
# 为什么单独建库而不是往现有库里灌：
#   - 现有库 0 条，是干净的；塞东西进去会污染「真实数据」的语义
#   - 独立库 + 明确的库名，后台一进来就知道「这是示范」
#   - 随时可整个删掉，不影响别的
#
# ⚠️ 这是**生产库写入** —— 只写新建的示范库，不碰任何既有库与数据。
#
# 用法：
#   PG_CONTAINER=WeKnora-postgres PG_DB=geo_knowledge sh deploy/seed-demo-kb.sh
set -e
exec 2>&1

PG_CONTAINER=${PG_CONTAINER:-WeKnora-postgres}
PG_DB=${PG_DB:-geo_knowledge}
PG_USER=${PG_USER:-postgres}
KB_NAME=${KB_NAME:-"建站示范库"}

echo "== 1. 建示范知识库 =="
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 <<'SQL'
-- ⚠️ knowledge_bases.id 是 varchar(36) 不是 uuid —— 用 varchar 比较
DO $$
DECLARE
  kb_id varchar(36) := 'a1b2c3d4-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM knowledge_bases WHERE id = kb_id) THEN
    INSERT INTO knowledge_bases (id, name, description, item_count, kb_type, sync_strategy)
    VALUES (kb_id, '建站示范库',
            '用于演示「知识库 → 网站内容」的编排流程。与云枢科技 SaaS 站点业务匹配。',
            6, 'mixed', 'manual');
    RAISE NOTICE '已创建建站示范库';
  ELSE
    RAISE NOTICE '建站示范库已存在，跳过创建';
  END IF;
END $$;
SQL

echo "== 2. 灌示范条目 =="
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO knowledge_items
  (id, kb_id, title, content, summary, tags, source_type, sync_status, content_hash, remote_hash, weknora_kb_id, updated_at)
VALUES
('a1b2c3d4-0000-4000-8000-000000000101',
 'a1b2c3d4-0000-4000-8000-000000000001',
 '私有化部署的合规检查清单',
 '私有化部署时，合规团队必问 12 个问题，按被问频率排序。

- 部署后是否需要联网 —— 离线许可证，不依赖外网授权校验
- 数据物理隔离到什么粒度 —— 数据库物理隔离加租户内行级隔离
- 审计日志保留多久 —— 默认 3 年，可延长至 7 年
- 是否支持信创适配 —— 已完成 12 家主流信创产品兼容性认证
- 密钥由谁保管 —— 支持客户自持密钥（BYOK）
- 是否可完全离线运行 —— 支持

在 180 家客户中，金融与国企占 46%，这些机构的问题高度重叠。',
 '金融与国企客户做私有化部署时必问的 12 个问题，按频率排序并给出标准答复。',
 ARRAY['私有化部署','合规审计'],
 'markdown', 'local_only', 'demo001', 'demo001', '', now()),

('a1b2c3d4-0000-4000-8000-000000000102',
 'a1b2c3d4-0000-4000-8000-000000000001',
 'SLA 可用性的准确定义',
 'SLA 说的是**服务可用性**，不是「系统不宕机」。

- 可用性按分钟级统计，低于承诺即计入 SLA 罚则
- 计划内维护窗口不计入不可用时长，需提前 5 个工作日通知
- 单点故障在 30 秒内自动切换，用户无感知
- 承诺值 99.95%，对应每月不可用时长上限约 21.9 分钟

关键区别：99.9% 和 99.95% 差 4.4 倍 —— 每月 43.8 分钟 vs 21.9 分钟。',
 'SLA 说的是服务可用性而非「不宕机」，含统计口径与承诺值的实际差距。',
 ARRAY['SLA','可用性'],
 'markdown', 'local_only', 'demo002', 'demo002', '', now()),

('a1b2c3d4-0000-4000-8000-000000000103',
 'a1b2c3d4-0000-4000-8000-000000000001',
 '单点登录（SSO）的对接方式',
 '支持三种 SSO 对接方式：

- SAML 2.0 —— 兼容 Okta、Azure AD、Keycloak
- OIDC —— 兼容 Casdoor、Keycloak 等标准实现
- CAS —— 兼容学校与部分政企老系统

已打通的企业身份系统包括：某股份制银行、某省联社、两家国有车企。
平均对接周期 5 个工作日。

审计日志与 SSO 账号一一对应，人员离职即停用全部权限。',
 '支持 SAML/OIDC/CAS 三种 SSO 对接方式，含已落地案例与平均对接周期。',
 ARRAY['SSO','身份集成'],
 'markdown', 'local_only', 'demo003', 'demo003', '', now()),

('a1b2c3d4-0000-4000-8000-000000000104',
 'a1b2c3d4-0000-4000-8000-000000000001',
 '数据集成网关的技术规格',
 '数据集成网关部署在企业网络边界，连接 ERP、CRM、数据库与 SaaS 等异构系统。

- 采集模式：实时与批量双模
- 单集群吞吐：每秒 20 万条
- 断点续传：支持，失败自动重试 3 次
- 数据质量校验：内置 12 条规则，支持自定义
- 端到端延迟：中位数 90 秒
- 支持信创：已完成 12 家主流信创产品兼容性认证',
 '部署在网络边界的数据集成网关，含吞吐、延迟、断点续传与信创兼容规格。',
 ARRAY['产品规格','数据集成'],
 'markdown', 'local_only', 'demo004', 'demo004', '', now()),

('a1b2c3d4-0000-4000-8000-000000000105',
 'a1b2c3d4-0000-4000-8000-000000000001',
 '股份制银行的报表交付提速案例',
 '客户背景：某股份制银行，需要把 6 个网点的月度报表统一到总行。

挑战：报表口径不一致，人工对账耗时，且总行每次汇总要等 4 天。

方案：接入数据集成网关统一采集，用数据工坊固化口径，做批处理任务编排。

- 月度报表交付周期从 6 周缩短至 4 天
- 取数环节人工工时减少 78%
- 报表数据口径不一致问题归零',
 '6 个网点报表统一到总行：交付周期 6 周→4 天，人工工时减少 78%。',
 ARRAY['客户案例','银行'],
 'markdown', 'local_only', 'demo005', 'demo005', '', now()),

('a1b2c3d4-0000-4000-8000-000000000106',
 'a1b2c3d4-0000-4000-8000-000000000001',
 '常见问题：为什么不用公有云多租户',
 '这是选型阶段最常见的疑问。

- 监管要求数据不出域 —— 公有云多租户无法满足
- 内部审计要求独立部署 —— 部署后与客户网络完全隔离
- 数据主权归属 —— 客户自己持有密钥，我们不持有
- 成本结构不同 —— 私有化一次性投入 + 年度维护，与用量脱钩

已有 46% 的客户选择私有化部署，主要集中在金融与国企。',
 '解释公有云多租户为何不满足金融与国企的监管、审计与数据主权要求。',
 ARRAY['售前答疑','私有化部署'],
 'markdown', 'local_only', 'demo006', 'demo006', '', now())
ON CONFLICT (id) DO NOTHING;
SQL

echo "== 3. 更新条目计数 =="
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c \
  "UPDATE knowledge_bases SET item_count = (SELECT count(*) FROM knowledge_items WHERE kb_id = 'a1b2c3d4-0000-4000-8000-000000000001'), updated_at = now() WHERE id = 'a1b2c3d4-0000-4000-8000-000000000001';"

echo "== 4. 验收 =="
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT name || ': ' || item_count || ' 条' FROM knowledge_bases WHERE id = 'a1b2c3d4-0000-4000-8000-000000000001';"
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT '  - ' || title FROM knowledge_items WHERE kb_id = 'a1b2c3d4-0000-4000-8000-000000000001' ORDER BY id;"

echo ""
echo "== 完成。后台刷新后即可看到「建站示范库」 =="
