/**
 * 询盘 → CRM 集成（Phase 3）。
 *
 * 契约对齐 geo-platform/apps/crm/backend/app/api/v1/crm/geo_leads.py：
 *   POST {CRM_BASE_URL}/api/v1/crm/leads
 *   body: { source, brand, contact, contact_type, event, metadata }
 *
 * 鉴权：服务间 X-API-Key（与 geo-platform 的服务间鉴权体系一致）。
 *
 * 关键设计：**静态站没有服务端** —— 所以这个模块跑在**外部网关**里
 * （CRM 网关 / Serverless / 边缘函数），不跑在客户站上。
 * 客户站只负责把表单 POST 到配置的 endpoint。
 *
 * 失败处理：网络失败**必须重试** —— 询盘丢了就是丢了客户。
 * 重试用指数退避；连续失败进死信（由调用方决定是否告警）。
 */

export interface InquiryPayload {
  /** 访客姓名 */
  name: string;
  /** 公司名称 */
  company: string;
  /** 联系电话 */
  phone: string;
  /** 邮箱 */
  email: string;
  /** 需求描述 */
  message: string;
  /** 来源页面 URL —— 定位访客从哪来 */
  sourceUrl?: string;
  /** UTM 参数 */
  utm?: Record<string, string>;
  /** 站点标识 —— 哪个客户站的询盘 */
  siteId?: string;
}

export interface CrmConfig {
  /** CRM 基地址，如 http://localhost:5010 */
  baseUrl: string;
  /** 服务间 API Key */
  apiKey?: string;
  /** 品牌名（CRM 里按 brand 归集） */
  brand: string;
  /** 超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试退避基数（毫秒） */
  backoffBase?: number;
}

export interface SubmitResult {
  ok: boolean;
  /** CRM 返回的线索 id */
  leadId?: string;
  /** 是否是新建（false 表示命中已有线索并合并） */
  isNew?: boolean;
  error?: string;
  /** 尝试次数 */
  attempts: number;
}

/**
 * 校验询盘表单。
 *
 * 服务端必须自己校验 —— 不能信任前端（纯静态站的前端校验只是体验）。
 */
export function validateInquiry(payload: Partial<InquiryPayload>): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!payload.name?.trim()) errors.push("姓名不能为空");
  if (!payload.company?.trim()) errors.push("公司名称不能为空");
  if (!payload.phone?.trim() && !payload.email?.trim()) {
    errors.push("电话与邮箱至少填一项");
  }
  if (payload.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    errors.push("邮箱格式不正确");
  }
  if (payload.phone?.trim() && !/^[\d+\-() ]{6,20}$/.test(payload.phone.trim())) {
    errors.push("电话格式不正确");
  }
  if (!payload.message?.trim()) errors.push("需求描述不能为空");
  if ((payload.message?.length ?? 0) > 5000) errors.push("需求描述过长");

  return { ok: errors.length === 0, errors };
}

/**
 * 把询盘转成 CRM 的 GEO Lead payload。
 */
export function toCrmLead(
  payload: InquiryPayload,
  config: Pick<CrmConfig, "brand">,
): Record<string, unknown> {
  // contact_type：优先邮箱（CRM 的联系方式字段）
  const contactType = payload.email?.trim() ? "email" : "phone";
  const contact = payload.email?.trim() || payload.phone?.trim() || "";

  return {
    source: "website_building",
    brand: config.brand,
    contact,
    contact_type: contactType,
    event: "website_inquiry",
    metadata: {
      name: payload.name,
      company: payload.company,
      phone: payload.phone,
      email: payload.email,
      message: payload.message,
      source_url: payload.sourceUrl,
      utm: payload.utm,
      site_id: payload.siteId,
    },
  };
}

/**
 * 提交询盘到 CRM（带重试）。
 */
export async function submitInquiry(
  payload: InquiryPayload,
  config: CrmConfig,
  options: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<SubmitResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const timeout = config.timeout ?? 10000;
  const maxRetries = config.maxRetries ?? 3;
  const backoffBase = config.backoffBase ?? 1000;

  const validation = validateInquiry(payload);
  if (!validation.ok) {
    return { ok: false, error: `询盘校验失败：${validation.errors.join("；")}`, attempts: 0 };
  }

  const body = toCrmLead(payload, config);
  const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/crm/leads`;

  let lastError = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { "X-API-Key": config.apiKey } : {}),
        },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          lead_id?: string;
          is_new?: boolean;
        };
        return {
          ok: true,
          leadId: data.lead_id ?? data.id,
          isNew: data.is_new,
          attempts: attempt,
        };
      }

      // 4xx 是客户端错误 —— 重试没有意义
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          error: `CRM 拒绝请求 HTTP ${res.status}: ${text.slice(0, 200)}`,
          attempts: attempt,
        };
      }

      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }

    if (attempt < maxRetries) {
      // 指数退避 + 抖动，避免重试风暴
      const delay = backoffBase * 2 ** (attempt - 1) + Math.random() * 200;
      await sleep(delay);
    }
  }

  return { ok: false, error: `提交失败（已重试 ${maxRetries} 次）：${lastError}`, attempts: maxRetries };
}

/**
 * 生成询盘端点的**边缘函数/Serverless** 实现参考。
 *
 * 这不是给客户站用的 —— 客户站是纯静态的，没有服务端。
 * 这里是给「谁来承接询盘」的标准答案：
 * 一个极小的 HTTP 处理器，读环境变量、调用 submitInquiry、返回结果。
 *
 * 返回值可直接用于 Vercel Edge Function / Cloudflare Worker / 任何 HTTP 运行时。
 */
export const inquiryHandlerSource = `/**
 * 询盘转发端点 —— 部署到边缘函数 / Serverless。
 *
 * 环境变量：
 *   CRM_BASE_URL   CRM 基地址
 *   CRM_API_KEY    服务间 X-API-Key（可选）
 *   SITE_BRAND     品牌名（用于 CRM 归集）
 *   SITE_ID        站点标识
 */
import { validateInquiry, submitInquiry } from "@geokit/geo-kit";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const validation = validateInquiry(payload);
  if (!validation.ok) {
    return Response.json({ ok: false, errors: validation.errors }, { status: 400 });
  }

  const result = await submitInquiry(
    { ...payload, siteId: payload.siteId ?? process.env.SITE_ID },
    {
      baseUrl: process.env.CRM_BASE_URL ?? "",
      apiKey: process.env.CRM_API_KEY,
      brand: process.env.SITE_BRAND ?? "unknown",
    },
  );

  return Response.json(result, { status: result.ok ? 200 : 502 });
}
`;
