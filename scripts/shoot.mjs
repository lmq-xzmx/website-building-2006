/**
 * 极简截图驱动：打开页面 → 等待 → （可选）依次点击选择器 → 截图。
 * 用 Chrome 的 CDP，Node 原生 WebSocket，零依赖。
 *
 * 用法：node shoot.mjs <url> <out.png> [clickSelector1,clickSelector2] [width] [height]
 */
const [url, out, clicks = "", w = "1440", h = "960"] = process.argv.slice(2);

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--no-proxy-server",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=/tmp/chrome-shoot-${Date.now()}`,
    "--hide-scrollbars",
    `--window-size=${w},${h}`,
    "about:blank",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let wsUrl = "";
const pick = (data) => {
  const m = String(data).match(/ws:\/\/[^\s]+/);
  if (m && !wsUrl) wsUrl = m[0];
};
chrome.stdout.on("data", pick);
chrome.stderr.on("data", pick);
for (let i = 0; i < 100 && !wsUrl; i++) await new Promise((r) => setTimeout(r, 100));
if (!wsUrl) {
  console.error("起不来 Chrome");
  process.exit(1);
}

// wsUrl 指向浏览器级 socket；拿 targets 再连页面
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });

const { result } = await send("Target.createTarget", { url: "about:blank" });
const targetId = result.targetId;
const { result: attach } = await send("Target.attachToTarget", { targetId, flatten: true });
const sessionId = attach.sessionId;

const call = (method, params) => send(method, params, sessionId);
await call("Page.enable");
await call("Runtime.enable");
await call("Page.navigate", { url });
await sleep(2500);

for (const sel of clicks.split(",").filter(Boolean)) {
  await call("Runtime.evaluate", {
    expression: `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.click(); return "ok"; } return "miss:" + ${JSON.stringify(sel)}; })()`,
    returnByValue: true,
  });
  await sleep(1200);
}
await sleep(1500);

const shot = await call("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log("written", out);

const errors = await call("Runtime.evaluate", {
  expression: "window.__errors ? JSON.stringify(window.__errors) : '[]'",
  returnByValue: true,
});
const errRaw = errors.result?.result?.value ?? "[]";
const errs = JSON.parse(errRaw);
if (errs.length) console.log("PAGE_ERRORS:", errs.slice(0, 10).join(" | "));
chrome.kill();
process.exit(0);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
