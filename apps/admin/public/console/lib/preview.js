/**
 * 版面预览 —— 把「编排 + 知识库正文」物化后的页面渲染成一页真站点。
 *
 * 为什么放 iframe 里：
 *   后台自己的样式（纸、墨、发丝线）绝不能漏进客户站点。
 *   两个设计系统各自独立，iframe 是唯一干净的边界。
 *
 * 旧后台没有这一层 —— 点了「预览」只看到条数统计，
 * 于是「发布后才发现首屏丑」成了日常。
 */

import { h } from "./dom.js";
import { mediaUrl } from "./api.js";
import { richDocToHtml } from "./rich.js";

const SANS = `"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif`;
const SERIF = `"Songti SC","Source Han Serif SC","Noto Serif SC",Georgia,serif`;

const VARIANTS = {
  default: { primary: "#1D2430", accent: "#B4552F", soft: "#F4F2ED" },
  forest: { primary: "#1E3A2C", accent: "#A9763F", soft: "#F1F3EE" },
  slate: { primary: "#243444", accent: "#5C86A6", soft: "#F0F3F6" },
  amber: { primary: "#3A2C1C", accent: "#B5801F", soft: "#F7F2E6" },
};

export function appearanceTokens(appearance = {}) {
  const v = VARIANTS[appearance.variant] ?? VARIANTS.default;
  return {
    primary: appearance.primaryColor || v.primary,
    accent: appearance.accentColor || v.accent,
    soft: v.soft,
    density: appearance.density === "compact" ? 0.78 : 1,
    radius: appearance.style === "minimal" ? "0px" : appearance.style === "classic" ? "2px" : "10px",
    layout: appearance.layout ?? "centered",
    serif: appearance.style === "classic" || appearance.layout === "editorial",
  };
}

/* ── 页面级 HTML ────────────────────────────────────────── */
export function buildPageHtml({ page, siteId, appearance = {}, siteName = "", nav = [] }) {
  const t = appearanceTokens(appearance);
  const body = (page?.modules ?? []).map((m) => renderModule(m, { siteId, t, appearance })).join("\n");
  const navItems = nav
    .filter((p) => p.published)
    .map((p) => `<a href="#"${p.path === page?.path ? ' aria-current="page"' : ""}>${esc(p.title)}</a>`)
    .join("");

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(page?.title ?? "预览")}</title>
<style>${siteCss(t)}</style></head>
<body data-layout="${t.layout}">
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="#">${esc(siteName || "站点")}</a>
    <nav>${navItems}</nav>
  </div>
</header>
<main>${body || emptyPage()}</main>
<footer class="site-foot"><div class="wrap"><span>${esc(siteName)}</span><span>© ${new Date().getFullYear()}</span></div></footer>
</body></html>`;
}

function emptyPage() {
  return `<div class="wrap empty-site"><p>这个页面还没有启用的模块。</p></div>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function img(siteId, url, alt, cls = "") {
  if (!url) return "";
  return `<img class="${cls}" src="${esc(mediaUrl(siteId, url))}" alt="${esc(alt ?? "")}" loading="lazy"/>`;
}

function docHtml(body) {
  if (!body) return "";
  try {
    return richDocToHtml(body);
  } catch {
    return "";
  }
}

/* ── 模块渲染 ──────────────────────────────────────────── */
function renderModule(mod, ctx) {
  const items = mod.items ?? [];
  const title = mod.title ? `<h2 class="mod-title">${esc(mod.title)}</h2>` : "";
  const sub = mod.subtitle ? `<p class="mod-sub">${esc(mod.subtitle)}</p>` : "";
  switch (mod.type) {
    case "hero": {
      const it = items[0] ?? {};
      const cta = it.href ? `<a class="btn" href="#">${esc(it.title ? "了解一下" : "查看")}</a>` : "";
      return `<section class="hero">
        <div class="wrap hero__in">
          <div class="hero__text">
            <h1>${esc(it.title ?? mod.title ?? "页面的第一句话")}</h1>
            ${it.summary ? `<p class="lede">${esc(it.summary)}</p>` : ""}
            <div class="cta-row">${cta}</div>
          </div>
          ${
            it.image
              ? `<figure class="hero__img">${img(ctx.siteId, it.image, it.alt ?? it.title, "")}</figure>`
              : `<div class="hero__mark" aria-hidden="true"></div>`
          }
        </div>
      </section>`;
    }
    case "rich-text":
      return `<section class="band"><div class="wrap prose">
        ${title}${sub}
        ${items.map((it) => `${it.title ? `<h3>${esc(it.title)}</h3>` : ""}${docHtml(it.body)}`).join("")}
      </div></section>`;
    case "card-grid": {
      const kind = mod.props?.kind ?? "products";
      return `<section class="band"><div class="wrap">
        ${title}${sub}
        <div class="cards cards--${esc(kind)}">
        ${items
          .map((it) => {
            const metas = [];
            if (it.client) metas.push(`<span class="meta">${esc(it.client)}</span>`);
            if ((it.results ?? []).length) metas.push(`<span class="meta meta--ok">${esc(it.results[0])}</span>`);
            const specs = (it.specs ?? []).length
              ? `<dl class="specs">${it.specs
                  .slice(0, 4)
                  .map((s) => `<div><dt>${esc(s.name)}</dt><dd>${esc(s.value)}${esc(s.unit ?? "")}</dd></div>`)
                  .join("")}</dl>`
              : "";
            return `<article class="card">
              ${it.image ? `<div class="card__img">${img(ctx.siteId, it.image, it.alt ?? it.title)}</div>` : ""}
              <div class="card__body">
                <h3>${esc(it.title ?? "卡片")}</h3>
                ${it.summary ? `<p>${esc(it.summary)}</p>` : ""}
                ${metas.join("")}
                ${specs}
              </div>
            </article>`;
          })
          .join("")}
        </div>
      </div></section>`;
    }
    case "faq":
      return `<section class="band"><div class="wrap">
        ${title}${sub}
        <div class="faq">
          ${items
            .map(
              (it) => `<details${items.indexOf(it) === 0 ? " open" : ""}>
              <summary>${esc(it.question ?? it.title ?? "问题")}</summary>
              <div class="faq__a">${it.answer ? `<p>${esc(it.answer)}</p>` : docHtml(it.body)}</div>
            </details>`,
            )
            .join("")}
        </div>
      </div></section>`;
    case "stats":
      return `<section class="band band--tight"><div class="wrap stats">
        ${items
          .map(
            (it) => `<div class="stat"><b>${esc(it.value ?? "—")}<small>${esc(it.unit ?? "")}</small></b><span>${esc(it.label ?? it.title ?? "")}</span></div>`,
          )
          .join("")}
      </div></section>`;
    case "cta":
      return `<section class="band cta-band"><div class="wrap cta-inner">
        <div><h2>${esc(items[0]?.title ?? mod.title ?? "下一步")}</h2>
        ${items[0]?.summary ? `<p>${esc(items[0].summary)}</p>` : ""}</div>
        <a class="btn btn--light" href="#">${esc(items[0]?.title ? "联系我们" : "开始")}</a>
      </div></section>`;
    case "gallery":
      return `<section class="band"><div class="wrap">
        ${title}
        <div class="gallery">${items
          .map(
            (it) => `<figure>${img(ctx.siteId, it.image, it.alt ?? it.title)}${it.title ? `<figcaption>${esc(it.title)}</figcaption>` : ""}</figure>`,
          )
          .join("")}</div>
      </div></section>`;
    case "trust":
      return `<section class="band"><div class="wrap">
        ${title}
        <ul class="trust">${items
          .map(
            (it) => `<li>${it.image ? img(ctx.siteId, it.image, it.alt ?? it.title) : ""}
            <div><b>${esc(it.title ?? "")}</b>${it.caption ? `<span>${esc(it.caption)}</span>` : ""}</div></li>`,
          )
          .join("")}</ul>
      </div></section>`;
    case "logo-wall":
      return `<section class="band band--tight"><div class="wrap">
        ${title}
        <div class="logos">${items
          .map((it) => `<div class="logo">${it.image ? img(ctx.siteId, it.image, it.alt ?? it.client ?? it.title) : `<span>${esc(it.client ?? it.title ?? "LOGO")}</span>`}</div>`)
          .join("")}</div>
      </div></section>`;
    case "process":
      return `<section class="band"><div class="wrap">
        ${title}
        <ol class="steps">${items
          .map(
            (it, i) => `<li><span class="step-no">${esc(String(it.step ?? i + 1).padStart(2, "0"))}</span>
            <div><b>${esc(it.title ?? "")}</b>${it.summary ? `<p>${esc(it.summary)}</p>` : ""}</div></li>`,
          )
          .join("")}</ol>
      </div></section>`;
    case "form":
      return `<section class="band"><div class="wrap form-band">
        <div class="form-copy">
          <h2>${esc(mod.title ?? "留个联系方式")}</h2>
          ${items.map((it) => `<p>${esc(it.summary ?? it.title ?? "")}</p>`).join("")}
        </div>
        <div class="form-mock">
          <label>称呼<input readonly placeholder="怎么称呼你"/></label>
          <label>手机<input readonly placeholder="方便回电的号码"/></label>
          <label>需求<textarea readonly placeholder="一句话说明需求"></textarea></label>
          <button class="btn" type="button">提交</button>
        </div>
      </div></section>`;
    default:
      return `<section class="band"><div class="wrap"><p class="muted">未支持的模块类型：${esc(mod.type)}</p></div></section>`;
  }
}

/* ── 站点 CSS（独立于后台）─────────────────────────────── */
function siteCss(t) {
  const d = t.density;
  const font = t.serif ? SERIF : SANS;
  return `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:${SANS};color:#20211F;background:#fff;line-height:1.7;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
.wrap{width:min(1040px,calc(100% - ${56 * d}px));margin:0 auto}
h1,h2,h3{font-family:${font};line-height:1.25;letter-spacing:-.01em;margin:0}
.site-head{border-bottom:1px solid #E7E4DC;background:#fff}
.site-head .wrap{display:flex;align-items:center;gap:24px;height:${64 * d}px}
.brand{font-family:${font};font-weight:700;font-size:17px;color:${t.primary};text-decoration:none;letter-spacing:.02em}
.site-head nav{display:flex;gap:20px;margin-left:auto}
.site-head nav a{font-size:13px;color:#57544D;text-decoration:none}
.site-head nav a[aria-current]{color:${t.primary};font-weight:600;border-bottom:2px solid ${t.accent};padding-bottom:2px}
.hero{background:${t.soft};border-bottom:1px solid #E9E6DE;padding:${72 * d}px 0 ${64 * d}px}
.hero__in{display:grid;grid-template-columns:1.15fr .85fr;gap:${48 * d}px;align-items:center}
.hero h1{font-size:${42 * d}px;max-width:22ch}
.hero .lede{font-size:16px;color:#4B4841;max-width:46ch;margin-top:14px}
.cta-row{margin-top:26px;display:flex;gap:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 20px;background:${t.accent};color:#fff;border:none;border-radius:${t.radius};font-size:14px;font-weight:600;text-decoration:none;cursor:pointer}
.btn--light{background:#fff;color:${t.primary}}
.hero__mark{aspect-ratio:4/3;border:1px solid #DCD8CE;background:
  repeating-linear-gradient(45deg,rgba(0,0,0,.028) 0 2px,transparent 2px 9px);border-radius:${t.radius}}
.hero__img img{aspect-ratio:4/3;object-fit:cover;border-radius:${t.radius}}
.band{padding:${56 * d}px 0}
.band--tight{padding:${30 * d}px 0}
.band + .band{border-top:1px solid #EFECE4}
.mod-title{font-size:${26 * d}px;margin-bottom:6px}
.mod-sub{color:#5B584F;margin:0 0 ${22 * d}px;font-size:14px}
.prose{max-width:720px}
.prose h2{font-size:${26 * d}px;margin-bottom:12px}
.prose h3{font-size:${19 * d}px;margin:${22 * d}px 0 8px}
.prose p{margin:0 0 ${15 * d}px}
.prose ul,.prose ol{margin:0 0 ${15 * d}px;padding-left:1.3em}
.prose li{margin-bottom:6px}
.prose blockquote{margin:${20 * d}px 0;padding-left:16px;border-left:3px solid ${t.accent};color:#4B4841;font-style:italic}
.prose pre{background:#F5F3ED;padding:14px;border-radius:${t.radius};overflow:auto;font-size:12.5px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:${18 * d}px}
.card{border:1px solid #E7E4DC;border-radius:${t.radius};overflow:hidden;background:#fff;display:flex;flex-direction:column}
.card__img img{aspect-ratio:16/10;object-fit:cover}
.card__body{padding:${16 * d}px}
.card__body h3{font-size:16px;margin-bottom:5px}
.card__body p{font-size:13.5px;color:#5B584F;margin:0 0 8px}
.meta{display:inline-block;font-size:11.5px;color:${t.primary};background:${t.soft};border-radius:2px;padding:2px 6px;margin-right:5px}
.meta--ok{color:#2F6047;background:#E7EFE8}
.specs{margin:10px 0 0;border-top:1px solid #EFECE4;padding-top:8px;display:grid;gap:4px}
.specs div{display:flex;justify-content:space-between;font-size:12px;gap:8px}
.specs dt{color:#8A867B}
.specs dd{margin:0;font-variant-numeric:tabular-nums;color:#33322C}
.faq{border-top:1px solid #E7E4DC;max-width:760px}
.faq details{border-bottom:1px solid #E7E4DC}
.faq summary{cursor:pointer;padding:${15 * d}px 0;font-weight:600;font-size:14.5px;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:#8A867B;font-weight:400}
.faq details[open] summary::after{content:"–"}
.faq__a{padding:0 0 ${15 * d}px;color:#4B4841;font-size:13.5px}
.faq__a p{margin:0 0 8px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:${18 * d}px}
.stat{border-left:2px solid ${t.accent};padding-left:14px}
.stat b{display:block;font-family:${SERIF};font-size:${30 * d}px;line-height:1.1;color:${t.primary}}
.stat b small{font-size:14px;margin-left:2px}
.stat span{font-size:12.5px;color:#5B584F}
.cta-band{background:${t.primary};color:#fff}
.cta-inner{display:flex;align-items:center;justify-content:space-between;gap:24px}
.cta-inner h2{font-size:${26 * d}px;color:#fff}
.cta-inner p{margin:6px 0 0;color:rgba(255,255,255,.72);font-size:14px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:${12 * d}px}
.gallery figure{margin:0}
.gallery img{aspect-ratio:1;object-fit:cover;border-radius:${t.radius}}
.gallery figcaption{font-size:11.5px;color:#8A867B;margin-top:5px}
.trust{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:${14 * d}px;list-style:none;padding:0;margin:0}
.trust li{display:flex;gap:10px;align-items:center;border:1px solid #E7E4DC;border-radius:${t.radius};padding:10px}
.trust img{width:44px;height:44px;object-fit:contain}
.trust b{display:block;font-size:13px}
.trust span{font-size:11.5px;color:#8A867B}
.logos{display:flex;flex-wrap:wrap;gap:${14 * d}px}
.logo{border:1px solid #E7E4DC;border-radius:${t.radius};padding:10px 18px;display:grid;place-items:center;min-width:110px;min-height:48px}
.logo img{max-height:30px;opacity:.72}
.logo span{font-size:12px;color:#8A867B;letter-spacing:.08em}
.steps{list-style:none;padding:0;margin:0;display:grid;gap:${14 * d}px;max-width:760px}
.steps li{display:flex;gap:14px;align-items:flex-start;border-top:1px solid #EFECE4;padding-top:${14 * d}px}
.step-no{font-family:${SERIF};font-size:20px;color:${t.accent};line-height:1.2;min-width:30px}
.steps b{font-size:14.5px}
.steps p{margin:3px 0 0;font-size:13px;color:#5B584F}
.form-band{display:grid;grid-template-columns:1fr 1fr;gap:${36 * d}px;align-items:start}
.form-copy h2{font-size:${24 * d}px;margin-bottom:8px}
.form-copy p{color:#5B584F;font-size:13.5px;margin:0 0 6px}
.form-mock{display:grid;gap:10px;border:1px solid #E7E4DC;border-radius:${t.radius};padding:18px;background:${t.soft}}
.form-mock label{display:grid;gap:5px;font-size:12px;color:#5B584F}
.form-mock input,.form-mock textarea{height:36px;border:1px solid #DCD8CE;border-radius:${t.radius};padding:0 10px;background:#fff;font:inherit;font-size:13px}
.form-mock textarea{height:64px;padding:8px 10px;resize:none}
.empty-site{padding:80px 0;color:#8A867B;font-size:14px}
.site-foot{border-top:1px solid #E7E4DC;padding:${22 * d}px 0;color:#8A867B;font-size:12px}
.site-foot .wrap{display:flex;justify-content:space-between}
body[data-layout="centered"] .hero__in{grid-template-columns:1fr;text-align:center;max-width:760px}
body[data-layout="centered"] .hero h1,body[data-layout="centered"] .hero .lede{margin-left:auto;margin-right:auto}
body[data-layout="centered"] .cta-row{justify-content:center}
body[data-layout="centered"] .hero__mark,body[data-layout="centered"] .hero__img{display:none}
body[data-layout="editorial"] .hero__in{grid-template-columns:1fr;gap:0}
body[data-layout="editorial"] .hero h1{font-size:${52 * d}px;max-width:16ch}
body[data-layout="editorial"] .hero{padding:${92 * d}px 0 ${64 * d}px}
body[data-layout="editorial"] .hero__mark,body[data-layout="editorial"] .hero__img{display:none}
body[data-layout="bold"] .hero{background:${t.primary};color:#fff}
body[data-layout="bold"] .hero h1{color:#fff;font-size:${48 * d}px}
body[data-layout="bold"] .hero .lede{color:rgba(255,255,255,.76)}
body[data-layout="bold"] .hero__mark{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.25)}
@media(max-width:820px){
  .hero__in,.form-band,.cta-inner{grid-template-columns:1fr;display:grid;gap:24px}
  .hero h1{font-size:${30 * d}px}
  .site-head nav{display:none}
}
`;
}

/* ── 预览控件（设备框架 + iframe）──────────────────────── */

/**
 * srcdoc 里绝不执行脚本。
 *
 * iframe 的 sandbox 只给 allow-same-origin（父页面要读 contentDocument 量高度），
 * 刻意不给 allow-scripts —— 预览的是客户站内容，正文来自知识库，
 * 让它跑脚本既不安全，也会让 Chrome 打
 *   "Blocked script execution in 'about:srcdoc' ... allow-scripts is not set"
 * 这种看着像故障的红字。
 *
 * 生成的页面本来就不含脚本；这里再做一遍兜底，
 * 防止知识库正文或外链里被塞进 script / on* / javascript: 时又冒出报错。
 */
function stripExecutable(html) {
  return String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}

export function previewFrame({ getPage, getAppearance, getNav, siteId, siteName, device = "desktop" }) {
  const iframe = h("iframe", { title: "版面预览", sandbox: "allow-same-origin" });
  const frame = h("div", { class: `frame frame--${device}` }, iframe);

  function paint() {
    const page = getPage();
    if (!page) {
      iframe.srcdoc = `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:sans-serif;display:grid;place-items:center;height:100vh;color:#8A867B;background:#F4F1E9;font-size:13px">没有可预览的页面</body>`;
      return;
    }
    iframe.srcdoc = stripExecutable(buildPageHtml({
      page,
      siteId,
      appearance: getAppearance?.() ?? {},
      siteName,
      nav: getNav?.() ?? [],
    }));
  }

  iframe.addEventListener("load", () => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const resize = () => {
        const hgt = Math.min(4000, Math.max(400, doc.documentElement.scrollHeight + 8));
        iframe.style.height = `${hgt}px`;
      };
      resize();
      // 折叠问答会改变高度
      doc.addEventListener("click", () => setTimeout(resize, 60));
      new ResizeObserver(resize).observe(doc.documentElement);
    } catch {
      /* 跨域兜底：懒加载也不需要报错 */
    }
  });

  return {
    el: frame,
    iframe,
    paint,
    setDevice(d) {
      frame.className = `frame frame--${d}`;
    },
  };
}
