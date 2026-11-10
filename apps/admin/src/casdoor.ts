/**
 * Casdoor OIDC 客户端 —— 授权码流程 + JWKS 本地验签。
 *
 * 为什么不用 SDK：
 *   Casdoor 的 SDK 在 Python 侧有个坑 —— introspect 把 token 放 form body，
 *   而服务端只从 query 读 → 任何 token 都判 inactive。
 *   （见记忆 `casdoor-introspect-broken-use-jwks`）
 *   所以这里走标准授权码流程，拿到 access_token 后**本地验签**，
 *   不依赖 introspect / userinfo 是否稳定。
 *
 * Casdoor 端点路径不对称（既定行为，不是 bug）：
 *   授权    GET  {external}/login/oauth/authorize
 *   换token POST {endpoint}/api/login/oauth/access_token
 *   用户信息 GET {endpoint}/api/userinfo
 *   JWKS    GET {endpoint}/.well-known/jwks     ← 注意不是 /api/get_jwks（那个要鉴权）
 *
 * external 与 endpoint 分开：
 *   external —— 浏览器跳转用的地址（开发机走 Tailscale，生产走公网）
 *   endpoint —— 服务端调用的地址（生产容器内走 host.docker.internal）
 *   两个方向签发的 token 都合法（iss 双轨校验）。
 */

import { createPublicKey, createVerify } from "node:crypto";

export interface CasdoorSettings {
  /** 浏览器跳转用（授权页） */
  externalEndpoint: string;
  /** 服务端调用用（换 token / 验签） */
  endpoint: string;
  clientId: string;
  clientSecret: string;
  organization: string;
  redirectUri: string;
}

export class CasdoorError extends Error {
  detail: string;
  statusCode: number;

  constructor(message: string, detail = "", statusCode = 502) {
    super(message);
    this.name = "CasdoorError";
    this.detail = detail;
    this.statusCode = statusCode;
  }
}

// ── JWKS 缓存 ──────────────────────────────────────────
// kid → 公钥（PEM）。key 轮换时按 kid 未命中强制刷新一次。

interface JwkEntry {
  kid: string;
  pem: string;
}

let keyCache: JwkEntry[] = [];
let keyCacheAt = 0;
const KEY_TTL_MS = 3600_000;

/** 未知 kid 的负缓存 —— 防止拿随机 kid 反复打爆 JWKS 端点 */
const missingKids = new Map<string, number>();
const MISSING_TTL_MS = 300_000;

function b64uToPem(jwk: { kty?: string; n?: string; e?: string }): string | null {
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) return null;
  try {
    // Node 原生支持 JWK → 公钥，不用手搓 base64。
    // ⚠️ 必须带 kty，只给 n/e 会解析失败
    const key = createPublicKey({
      key: { kty: "RSA", n: jwk.n, e: jwk.e },
      format: "jwk",
    });
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch {
    return null;
  }
}

async function fetchJwks(settings: CasdoorSettings): Promise<JwkEntry[]> {
  const url = `${settings.endpoint.replace(/\/+$/, "")}/.well-known/jwks`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch (err) {
    throw new CasdoorError(
      "Casdoor JWKS 不可达",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new CasdoorError("Casdoor JWKS 取不到", `HTTP ${res.status}`);
  }
  const doc = (await res.json()) as { keys?: Array<Record<string, unknown>> };
  const out: JwkEntry[] = [];
  for (const k of doc.keys ?? []) {
    if (k.kty !== "RSA" || k.use !== "sig") continue;
    const kid = typeof k.kid === "string" ? k.kid : "";
    if (!kid) continue;
    const pem = b64uToPem({ kty: k.kty as string, n: k.n as string, e: k.e as string });
    if (!pem) continue;
    out.push({ kid, pem });
  }
  keyCache = out;
  keyCacheAt = Date.now();
  missingKids.clear();
  return out;
}

async function getKey(settings: CasdoorSettings, kid: string): Promise<string> {
  const stale = Date.now() - keyCacheAt > KEY_TTL_MS;
  if (stale || !keyCache.some((k) => k.kid === kid)) {
    missingKids.delete(kid);
    await fetchJwks(settings);
  }
  const hit = keyCache.find((k) => k.kid === kid);
  if (!hit) {
    // 负缓存：刚刷新过还没有的 kid，短时间内别再打 JWKS
    missingKids.set(kid, Date.now() + MISSING_TTL_MS);
    throw new CasdoorError(`未知的密钥 id: ${kid}`, "", 401);
  }
  return hit.pem;
}

function decodeSegment(seg: string): Record<string, unknown> {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(pad, "base64").toString("utf8")) as Record<string, unknown>;
}

/**
 * 本地验签 Casdoor 签发的 JWT（RS256），返回 claims。
 *
 * 不验 aud / iss 之外的东西交给调用方（iss 要双轨校验，见下面）。
 */
export async function verifyJwt(
  settings: CasdoorSettings,
  token: string,
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new CasdoorError("令牌格式错误", "", 401);

  let header: Record<string, unknown>;
  try {
    header = decodeSegment(parts[0]);
  } catch {
    throw new CasdoorError("令牌头解析失败", "", 401);
  }
  if (header.alg !== "RS256") {
    throw new CasdoorError("令牌算法不是 RS256", String(header.alg), 401);
  }
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!kid) throw new CasdoorError("令牌头缺少 kid", "", 401);

  const missUntil = missingKids.get(kid) ?? 0;
  if (missUntil > Date.now()) {
    throw new CasdoorError(`未知的密钥 id: ${kid}`, "", 401);
  }

  const pem = await getKey(settings, kid);
  const sig = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(pem, sig)) {
    throw new CasdoorError("签名校验失败", "", 401);
  }

  let claims: Record<string, unknown>;
  try {
    claims = decodeSegment(parts[1]);
  } catch {
    throw new CasdoorError("令牌载荷解析失败", "", 401);
  }

  // iss 双轨：容器内走 ENDPOINT，浏览器走 EXTERNAL，两个方向都合法
  const issuers = [
    settings.endpoint.replace(/\/+$/, ""),
    settings.externalEndpoint.replace(/\/+$/, ""),
  ].filter(Boolean);
  const iss = String(claims.iss ?? "").replace(/\/+$/, "");
  if (issuers.length && !issuers.includes(iss)) {
    throw new CasdoorError(`不可信的签发方: ${iss}`, `期望其一: ${issuers.join(", ")}`, 401);
  }

  // id_token 不能当 access_token 用
  if (claims.tokenType === "id-token") {
    throw new CasdoorError("id token 不能当访问令牌使用", "", 401);
  }

  // 过期检查（Casdoor 的 access_token 是 JWT，自带 exp）
  const exp = Number(claims.exp ?? 0);
  if (exp && exp * 1000 < Date.now()) {
    throw new CasdoorError("令牌已过期", "", 401);
  }

  return claims;
}

/** 拼授权页地址 */
export function authorizeUrl(settings: CasdoorSettings, state: string): string {
  const params = new URLSearchParams({
    client_id: settings.clientId,
    response_type: "code",
    redirect_uri: settings.redirectUri,
    scope: "openid profile email",
    state,
  });
  return `${settings.externalEndpoint.replace(/\/+$/, "")}/login/oauth/authorize?${params.toString()}`;
}

/** 用 code 换 access_token（Casdoor 接受 JSON body） */
export async function exchangeCode(
  settings: CasdoorSettings,
  code: string,
): Promise<string> {
  if (!settings.clientSecret) {
    throw new CasdoorError("Casdoor client_secret 未配置", "", 500);
  }
  const url = `${settings.endpoint.replace(/\/+$/, "")}/api/login/oauth/access_token`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new CasdoorError(
      "Casdoor 不可达",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  if (!res.ok) {
    throw new CasdoorError("Casdoor 换取令牌失败", raw.slice(0, 500), 400);
  }
  let payload: { access_token?: string };
  try {
    payload = JSON.parse(raw) as { access_token?: string };
  } catch {
    throw new CasdoorError("Casdoor 返回的不是 JSON", raw.slice(0, 500), 400);
  }
  if (!payload.access_token) {
    throw new CasdoorError("Casdoor 未返回 access_token", raw.slice(0, 500), 400);
  }
  return payload.access_token;
}

/** 取用户信息。优先标准 userinfo，退回 Casdoor 的 get-account。 */
export async function fetchUserInfo(
  settings: CasdoorSettings,
  accessToken: string,
): Promise<Record<string, unknown> | null> {
  for (const path of ["/api/userinfo", "/api/get-account"]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(
        `${settings.endpoint.replace(/\/+$/, "")}${path}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal },
      ).finally(() => clearTimeout(timer));
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        status?: string;
        data?: Record<string, unknown>;
      };
      if (payload.status === "ok" && payload.data) return payload.data;
    } catch {
      continue;
    }
  }
  return null;
}

export interface CasdoorUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  organization: string;
  role: string;
}

/**
 * 从 access_token 的 claims + userinfo 合成用户身份。
 *
 * 组织校验：Casdoor 用户里的 organization 字段是**显示名**，
 * 而 owner 字段是**组织名**（如 zhongkeju）。两个都认。
 */
export function toUser(
  claims: Record<string, unknown>,
  info: Record<string, unknown> | null,
  organization: string,
): CasdoorUser {
  const pick = (key: string): string => {
    const v = info?.[key] ?? claims[key];
    return v === undefined || v === null ? "" : String(v);
  };

  const owner = pick("owner");
  const org = pick("organization");
  if (organization) {
    const ok = owner === organization || org === organization;
    if (!ok) {
      throw new CasdoorError(
        `用户不在组织 ${organization} 内`,
        `owner=${owner} organization=${org}`,
        403,
      );
    }
  }

  const id = pick("sub") || pick("id") || pick("preferred_username");
  if (!id) throw new CasdoorError("令牌里没有用户标识", "", 401);

  return {
    id,
    name: pick("preferred_username") || pick("name") || id,
    displayName: pick("displayName") || pick("name") || id,
    email: pick("email"),
    organization: owner || org || organization,
    role: pick("role"),
  };
}
