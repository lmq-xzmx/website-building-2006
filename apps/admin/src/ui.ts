/**
 * 后台外壳 —— 只吐一页骨架，界面在 public/console/ 里。
 *
 * 为什么从「一个巨型 TS 模板字符串」换成静态资源：
 *   旧界面的 HTML/CSS/JS 全塞在 .ts 的模板字符串里，代价是
 *     · 客户端代码不能写反引号（会和宿主模板打架）
 *     · 没有语法高亮、没有类型，改一行要重启整页
 *     · 七个面板互相 import，样式互相覆盖
 *   现在客户端是真正的 .js/.css 文件（ES 模块，零构建），
 *   服务端只负责注入登录用户与权限，不再参与界面渲染。
 */

export async function renderPage(
  user?: { displayName?: string; name?: string; role?: string },
  permissions: string[] = [],
): Promise<string> {
  const safeUser = (user
    ? JSON.stringify({ displayName: user.displayName, name: user.name, role: user.role })
    : "null"
  ).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>内容后台 · 打样台</title>
<meta name="color-scheme" content="light" />
<link rel="stylesheet" href="/console/index.css" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23191813'/%3E%3Ctext x='7' y='23' font-size='18' font-family='serif' fill='%23F0EBDE'%3E样%3C/text%3E%3C/svg%3E" />
</head>
<body>
<div id="app" aria-busy="true"></div>
<noscript>
  <p style="font:14px/1.7 sans-serif;padding:40px;color:#191813">
    这个后台需要 JavaScript —— 它是一套编辑界面，不是只读页面。
  </p>
</noscript>
<script>
  window.__USER__ = ${safeUser};
  window.__PERMS__ = ${JSON.stringify(permissions).replace(/</g, "\\u003c")};
  window.__errors = [];
  // Chrome 在 iframe 尺寸联动时会抛这条良性通知，不算界面错误
  const benign = (s) => /ResizeObserver loop/i.test(s);
  window.addEventListener("error", (e) => {
    const m = String(e.message ?? e);
    if (!benign(m)) window.__errors.push(m);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const m = String(e.reason);
    if (!benign(m)) window.__errors.push(m);
  });
</script>
<script type="module" src="/console/app.js"></script>
</body>
</html>`;
}
