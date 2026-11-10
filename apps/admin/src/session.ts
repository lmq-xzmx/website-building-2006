/**
 * 本地会话 —— 登录成功后由后台自己签发，前端不持有令牌。
 *
 * 设计取舍：
 *   - 令牌放 **httpOnly cookie**，不是 localStorage。
 *     localStorage 里的令牌一次 XSS 就能读走；httpOnly cookie 读不到，
 *     配合 SameSite=Lax + 站外跳转前的 Origin 校验，跨站请求也用不上。
 *   - 令牌是**本服务签发的 HS256**，不是 Casdoor 的 access_token。
 *     Casdoor 的 access_token 拿去直接调后台 API 会把 Casdoor 端点拖进
 *     每个请求的热路径，也不好吊销。本地令牌可随时作废（换密钥即可）。
 *   - 会话有效期 8 小时 —— 够用一天的工作，不用做刷新令牌。
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const SESSION_COOKIE = "wb_session";
const SESSION_TTL_MS = 8 * 3600_000;

export interface SessionUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  organization: string;
  role: string;
}

function b64u(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64uToBuf(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
}

/**
 * 会话密钥。
 *
 * 优先用环境变量 WB_SESSION_SECRET；没给就**随机生成一把**——
 * 这意味着重启后台后所有会话失效（重新登录），可接受，
 * 且比「硬编码一个弱默认口令」安全。
 */
export const SESSION_SECRET = process.env.WB_SESSION_SECRET || randomBytes(32).toString("hex");

if (!process.env.WB_SESSION_SECRET) {
  console.warn(
    "⚠️ 未设置 WB_SESSION_SECRET —— 会话密钥临时随机生成，重启后台后需重新登录",
  );
}

export function signSession(user: SessionUser): string {
  const payload = b64u(
    JSON.stringify({
      u: user,
      exp: Date.now() + SESSION_TTL_MS,
    }),
  );
  const sig = b64u(createHmac("sha256", SESSION_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const expected = createHmac("sha256", SESSION_SECRET).update(parts[0]).digest();
  let given: Buffer;
  try {
    given = b64uToBuf(parts[1]);
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(b64uToBuf(parts[0]).toString("utf8")) as {
      u: SessionUser;
      exp: number;
    };
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload.u;
  } catch {
    return null;
  }
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function currentUser(req: IncomingMessage): SessionUser | null {
  const cookies = parseCookies(req);
  return verifySession(cookies[SESSION_COOKIE]);
}

export function setSessionCookie(res: ServerResponse, token: string): void {
  appendCookie(
    res,
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
      SESSION_TTL_MS / 1000
    }`,
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  appendCookie(res, `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function appendCookie(res: ServerResponse, cookie: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", [cookie]);
  } else if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookie]);
  } else {
    res.setHeader("Set-Cookie", [String(existing), cookie]);
  }
}
