/**
 * 后台界面 —— 单页，纯原生 JS，**无构建步骤**。
 *
 * 为什么不用 React/Vue：
 *   后台是内部工具，交互复杂度中等，但**启动要快、部署要简单**。
 *   一个 .ts 文件 + 原生 DOM，零构建、零依赖、node 直接跑。
 *   真需要复杂交互时再换框架 —— 届时 API 边界已经划好，不影响后端。
 *
 * 信息架构（v2 重构）：
 *   左侧边栏  站点选择 + 主导航（内容编排 / 媒体 / 片段 / 版本 / 公众号 / 旧版编排）
 *   顶栏      面包屑 · 全局状态 · 知识库抽屉开关 · 上下文保存/发布
 *   工作台    当前视图的面板（模块五栏 / 旧编排双栏 / 媒体 / 片段 / 版本 / 公众号）
 *   右抽屉    知识库（素材源，所有视图可调出，搜索后「加入编排/加入模块」）
 *
 * 两个编辑模型并存：
 *   模块视图（默认）—— 页面→模块→条目，自由组合，是主力工具
 *   旧版编排        —— 知识库条目→固定槽位（insights/faq/products/cases），保留兼容
 */

import { EDITOR_SCRIPT } from "./editor.ts";
import { MODULE_PANEL_CSS, MODULE_PANEL_HTML, MODULE_PANEL_SCRIPT } from "./modules-ui.ts";
import {
  WECHAT_PANEL_CSS,
  WECHAT_PANEL_HTML,
  WECHAT_PANEL_SCRIPT,
} from "./wechat-ui.ts";
import {
  MEDIA_PANEL_CSS,
  MEDIA_PANEL_HTML,
  MEDIA_PANEL_SCRIPT,
} from "./media-ui.ts";
import {
  FRAGMENTS_PANEL_CSS,
  FRAGMENTS_PANEL_HTML,
  FRAGMENTS_PANEL_SCRIPT,
} from "./fragments-ui.ts";
import {
  HISTORY_PANEL_CSS,
  HISTORY_PANEL_HTML,
  HISTORY_PANEL_SCRIPT,
} from "./history-ui.ts";

export async function renderPage(
  user?: { displayName?: string; name?: string; role?: string },
  permissions: string[] = [],
): Promise<string> {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>内容后台 · 智能建站</title>
<style>
  :root {
    --bg: #0b0e14;
    --bg-grad: radial-gradient(1200px 600px at 80% -10%, rgba(99,102,241,.12), transparent 60%),
               radial-gradient(900px 500px at -10% 110%, rgba(56,189,248,.08), transparent 60%);
    --sidebar: #0e1219;
    --panel: #12161f;
    --panel-2: #1a1f2b;
    --panel-3: #222836;
    --line: #262c3a;
    --line-soft: #1e2430;
    --line-strong: #363d4f;
    --text: #e8ebf3;
    --dim: #8b93a7;
    --dim-2: #6b7280;
    --accent: #7c8cff;
    --accent-strong: #6366f1;
    --accent-soft: rgba(124,140,255,.14);
    --ok: #34d399;
    --warn: #fbbf24;
    --err: #fb7185;
    --radius: 10px;
    --radius-sm: 7px;
    --shadow-sm: 0 1px 2px rgba(0,0,0,.25);
    --shadow-md: 0 6px 20px rgba(0,0,0,.35);
    --shadow-lg: 0 16px 48px rgba(0,0,0,.5);
    --ring: 0 0 0 3px rgba(124,140,255,.22);
    --sidebar-w: 216px;
    --topbar-h: 54px;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg); background-image: var(--bg-grad); background-attachment: fixed;
    color: var(--text);
    font: 14px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  }
  /* ── 应用壳 ─────────────────────────────────────────── */
  .app { display: flex; height: 100vh; overflow: hidden; }

  /* 侧边栏 */
  .sidebar {
    width: var(--sidebar-w); flex-shrink: 0; display: flex; flex-direction: column;
    background: var(--sidebar); border-right: 1px solid var(--line-soft);
    padding: 14px 10px; gap: 4px;
  }
  .brand {
    display: flex; align-items: center; gap: 10px; padding: 4px 8px 14px;
    font-size: 15px; font-weight: 700; letter-spacing: .2px;
  }
  .brand::before {
    content: ""; width: 11px; height: 11px; border-radius: 3.5px; flex-shrink: 0;
    background: linear-gradient(135deg, var(--accent), #38bdf8);
    box-shadow: 0 0 12px rgba(124,140,255,.6);
  }
  .site-pick { padding: 0 4px 12px; }
  .site-pick select { width: 100%; font-size: 12.5px; padding: 7px 9px; }
  .nav { display: flex; flex-direction: column; gap: 2px; }
  .nav-label {
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px;
    color: var(--dim-2); padding: 10px 10px 4px;
  }
  .nav button {
    display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm);
    padding: 8px 10px; font-size: 13px; color: var(--dim); cursor: pointer;
    transition: background .15s, color .15s;
  }
  .nav button:hover { background: var(--panel-2); color: var(--text); }
  .nav button.on { background: var(--accent-soft); color: var(--accent); font-weight: 600;
    box-shadow: inset 0 0 0 1px rgba(124,140,255,.22); }
  .nav button svg { width: 16px; height: 16px; flex-shrink: 0; opacity: .85; }
  .nav button.on svg { opacity: 1; }
  .nav-sep { height: 1px; background: var(--line-soft); margin: 8px 6px; }
  .who {
    margin-top: auto; display: flex; align-items: center; gap: 8px;
    padding: 10px 8px 2px; border-top: 1px solid var(--line-soft);
    font-size: 12px; color: var(--dim); flex-wrap: wrap;
  }
  .who button { padding: 3px 9px; font-size: 12px; }

  /* 主列 */
  .main-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }

  /* 顶栏 */
  .topbar {
    height: var(--topbar-h); flex-shrink: 0; display: flex; align-items: center; gap: 12px;
    padding: 0 16px; border-bottom: 1px solid var(--line-soft);
    background: rgba(14,18,25,.78); backdrop-filter: saturate(140%) blur(10px);
    z-index: 5;
  }
  .crumb { font-size: 13px; color: var(--dim); white-space: nowrap; }
  .crumb b { color: var(--text); font-weight: 600; }
  .crumb .sep { margin: 0 7px; color: var(--dim-2); }
  .topbar .sp { flex: 1; }
  .chips { display: flex; gap: 6px; align-items: center; }
  .chip {
    font-size: 11.5px; color: var(--dim); background: var(--panel-2);
    border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .chip b { color: var(--text); font-weight: 600; }
  .chip.ok b { color: var(--ok); }
  .chip.err b { color: var(--err); }
  .chip.warn b { color: var(--warn); }

  /* 工作台 */
  .workbench { flex: 1; min-height: 0; position: relative; }

  /* ── 通用控件 ─────────────────────────────────────── */
  select, input, button, textarea {
    font: inherit; color: var(--text); background: var(--panel-2);
    border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 6px 10px;
    transition: border-color .15s, box-shadow .15s, background .15s, transform .05s;
  }
  select:focus-visible, input:focus-visible, textarea:focus-visible, button:focus-visible {
    outline: none; border-color: var(--accent); box-shadow: var(--ring);
  }
  input::placeholder, textarea::placeholder { color: var(--dim-2); }
  button { cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 6px; }
  button:hover { border-color: var(--line-strong); background: var(--panel-3); }
  button:active { transform: translateY(1px); }
  button.primary {
    background: linear-gradient(135deg, var(--accent-strong), #5b6cff);
    color: #fff; border-color: transparent; font-weight: 600;
    box-shadow: 0 4px 14px rgba(99,102,241,.35);
  }
  button.primary:hover { filter: brightness(1.08); background: linear-gradient(135deg, var(--accent-strong), #5b6cff); }
  button:disabled { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }
  button.ghost { background: transparent; }
  input[type=search] { min-width: 180px; }

  /* 面板通用 */
  section.pane, .pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .pane-head {
    padding: 10px 14px; border-bottom: 1px solid var(--line-soft);
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  }
  .pane-head h2 { font-size: 11px; margin: 0; font-weight: 700; color: var(--dim); text-transform: uppercase; letter-spacing: .9px; }
  .pane-head .sp { flex: 1; }
  .pane-body { overflow-y: auto; padding: 12px; flex: 1;
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .pane-body::-webkit-scrollbar { width: 8px; height: 8px; }
  .pane-body::-webkit-scrollbar-thumb { background: var(--line); border-radius: 8px; }
  .pane-body::-webkit-scrollbar-thumb:hover { background: var(--line-strong); }

  /* 旧版编排：双栏 */
  #planView { display: grid; grid-template-columns: 1.2fr 1fr; height: 100%; }
  #planView > section { border-right: 1px solid var(--line-soft); }
  #planView > section:last-child { border-right: none; }
  #planView[hidden], .module-pane[hidden], .wechat-pane[hidden],
  .media-pane[hidden], .fragments-pane[hidden], .history-pane[hidden] { display: none !important; }

  .row {
    border: 1px solid var(--line-soft); border-radius: var(--radius);
    padding: 10px 12px; margin-bottom: 8px; background: var(--panel);
    box-shadow: var(--shadow-sm); transition: border-color .15s, transform .12s, box-shadow .15s;
  }
  .row:hover { border-color: var(--line-strong); transform: translateY(-1px); box-shadow: var(--shadow-md); }
  .row .t { font-weight: 600; margin-bottom: 4px; font-size: 13.5px; }
  .row .m { color: var(--dim); font-size: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .pill {
    border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px;
    font-size: 11px; color: var(--dim); background: var(--panel-2);
    line-height: 1.6; white-space: nowrap;
  }
  .pill.ok { color: var(--ok); border-color: rgba(52,211,153,.35); background: rgba(52,211,153,.1); }
  .pill.warn { color: var(--warn); border-color: rgba(251,191,36,.35); background: rgba(251,191,36,.1); }
  .pill.err { color: var(--err); border-color: rgba(251,113,133,.35); background: rgba(251,113,133,.1); }
  .row button { padding: 3px 9px; font-size: 12px; }
  .empty { color: var(--dim-2); text-align: center; padding: 48px 12px; font-size: 13px; line-height: 1.8; }
  .problem { border-left: 3px solid var(--err); padding: 8px 12px; background: rgba(251,113,133,.08); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; margin-bottom: 8px; font-size: 13px; }
  .problem.warn { border-color: var(--warn); background: rgba(251,191,36,.08); }
  .problem.ok { border-color: var(--ok); background: rgba(52,211,153,.08); }
  .slot { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .slot select { padding: 3px 7px; font-size: 12px; }
  .slot input { padding: 3px 7px; font-size: 12px; }
  .grow { flex: 1; min-width: 90px; }
  .drag { cursor: grab; color: var(--dim-2); user-select: none; transition: color .15s; }
  .drag:hover { color: var(--accent); }
  .count { color: var(--dim); font-size: 12px; font-variant-numeric: tabular-nums; }
  code { background: var(--panel-3); padding: 1px 6px; border-radius: 5px; font-size: 12px; font-family: ui-monospace, "SF Mono", Menlo, monospace; color: #c4b5fd; }

  /* ── 知识库抽屉 ─────────────────────────────────────── */
  .drawer-scrim {
    position: fixed; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(2px);
    opacity: 0; pointer-events: none; transition: opacity .2s; z-index: 40;
  }
  .drawer-scrim.on { opacity: 1; pointer-events: auto; }
  .kb-drawer {
    position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 92vw;
    background: var(--sidebar); border-left: 1px solid var(--line);
    box-shadow: var(--shadow-lg); z-index: 50;
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform .25s cubic-bezier(.4,0,.2,1);
  }
  .kb-drawer.on { transform: translateX(0); }
  .kb-resize {
    position: absolute; left: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize;
    z-index: 5;
  }
  .kb-resize:hover, .kb-resize.dragging { background: var(--accent); }
  body.kb-resizing { user-select: none; cursor: col-resize; }
  .kb-drawer-head { padding: 14px 14px 10px; border-bottom: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 8px; }
  .kb-drawer-head .row1 { display: flex; align-items: center; gap: 8px; }
  .kb-drawer-head h2 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .3px; }
  .kb-drawer-head select { flex: 1; font-size: 12.5px; }
  .kb-drawer-head input[type=search] { flex: 1; min-width: 0; }
  .kb-drawer-body { flex: 1; overflow-y: auto; padding: 12px;
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .kb-drawer-body::-webkit-scrollbar { width: 8px; }
  .kb-drawer-body::-webkit-scrollbar-thumb { background: var(--line); border-radius: 8px; }
  .kb-close { background: transparent; border: none; font-size: 18px; padding: 4px 8px; color: var(--dim); }
  .kb-close:hover { color: var(--text); background: var(--panel-2); }

  /* toast */
  .toast {
    position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%) translateY(8px);
    background: var(--panel-3); border: 1px solid var(--line-strong); border-radius: var(--radius);
    padding: 10px 18px; font-size: 13px; opacity: 0; transition: opacity .2s, transform .2s;
    pointer-events: none; box-shadow: var(--shadow-md); z-index: 100;
  }
  .toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }
  .toast.err { border-color: var(--err); }

  /* ── 骨架屏（加载占位）──────────────────────────────── */
  .sk { border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--panel-2) 25%, var(--panel-3) 50%, var(--panel-2) 75%);
    background-size: 200% 100%; animation: shimmer 1.3s infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .sk-row { height: 62px; margin-bottom: 8px; border-radius: var(--radius); }

  /* ── 命令面板（⌘K）────────────────────────────────── */
  .cmdk-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.5); backdrop-filter: blur(3px);
    z-index: 80; display: none; align-items: flex-start; justify-content: center; padding-top: 14vh; }
  .cmdk-scrim.on { display: flex; }
  .cmdk { width: 560px; max-width: 92vw; background: var(--panel); border: 1px solid var(--line-strong);
    border-radius: 14px; box-shadow: var(--shadow-lg); overflow: hidden; }
  .cmdk-input { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--line-soft); }
  .cmdk-input input { flex: 1; border: none; background: transparent; padding: 0; font-size: 15px; box-shadow: none !important; }
  .cmdk-input input:focus { box-shadow: none; }
  .cmdk-input kbd { font: 11px ui-monospace, monospace; color: var(--dim-2); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; }
  .cmdk-list { max-height: 340px; overflow-y: auto; padding: 6px; }
  .cmdk-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px;
    font-size: 13.5px; color: var(--text); cursor: pointer; }
  .cmdk-item:hover, .cmdk-item.on { background: var(--accent-soft); }
  .cmdk-item .cmd-k { margin-left: auto; font: 11px ui-monospace, monospace; color: var(--dim-2); }
  .cmdk-item .cmd-cat { font-size: 11px; color: var(--dim-2); width: 56px; flex-shrink: 0; }
  .cmdk-empty { padding: 24px; text-align: center; color: var(--dim-2); font-size: 13px; }

  /* ── 通用确认弹窗 ──────────────────────────────────── */
  .modal-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
    z-index: 90; display: none; align-items: center; justify-content: center; }
  .modal-scrim.on { display: flex; }
  .modal { width: 440px; max-width: 92vw; background: var(--panel); border: 1px solid var(--line-strong);
    border-radius: 14px; box-shadow: var(--shadow-lg); padding: 20px; }
  .modal h3 { margin: 0 0 8px; font-size: 16px; }
  .modal p { margin: 0 0 14px; color: var(--dim); font-size: 13.5px; line-height: 1.6; }
  .modal .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
  .modal .modal-summary { background: var(--panel-2); border: 1px solid var(--line-soft); border-radius: 8px;
    padding: 10px 12px; font-size: 12.5px; color: var(--dim); display: flex; flex-direction: column; gap: 4px; }
  .modal .modal-summary b { color: var(--text); }

  button.loading { opacity: .7; pointer-events: none; }
  .spinner { width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
    border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* 角色标签 */
  .role-tag {
    font-size: 10.5px; padding: 2px 8px; border-radius: 999px;
    background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(124,140,255,.3);
    font-weight: 600; letter-spacing: .3px;
  }

  ${MODULE_PANEL_CSS}
  ${WECHAT_PANEL_CSS}
  ${MEDIA_PANEL_CSS}
  ${FRAGMENTS_PANEL_CSS}
  ${HISTORY_PANEL_CSS}
</style>
</head>
<body>
<div class="app">
  <!-- 侧边栏 -->
  <aside class="sidebar">
    <div class="brand">内容后台</div>
    <div class="site-pick">
      <label class="count" style="display:block;margin-bottom:4px">站点</label>
      <select id="site"></select>
    </div>
    <nav class="nav">
      <div class="nav-label">工作台</div>
      <button data-view="module" class="on">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
        内容编排
      </button>
      <button data-view="media">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        媒体库
      </button>
      <button data-view="fragments">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h7v7H4zM13 13h7v7h-7z"/><path d="M13 4h7v4M4 16v4h4"/></svg>
        片段库
      </button>
      <button data-view="history">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        版本历史
      </button>
      <button data-view="wechat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>
        公众号
      </button>
      <div class="nav-sep"></div>
      <div class="nav-label">兼容</div>
      <button data-view="plan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        旧版编排
      </button>
    </nav>
    <div class="who" id="who"></div>
  </aside>

  <!-- 主列 -->
  <div class="main-col">
    <header class="topbar">
      <div class="crumb">
        <b id="crumbSite">—</b><span class="sep">/</span><span id="crumbView">内容编排</span>
      </div>
      <div class="chips" id="chips">
        <span class="chip" id="chipPlan" hidden></span>
      </div>
      <span class="sp"></span>
      <button id="kbToggle" title="打开知识库抽屉">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        知识库
      </button>
      <button id="reload">刷新库</button>
      <button id="save" hidden>保存计划</button>
      <button id="publish" class="primary" hidden>发布</button>
    </header>

    <div class="workbench">
      <!-- 旧版编排（双栏） -->
      <section id="planView" hidden>
        <section class="pane">
          <div class="pane-head"><h2>编排台</h2><span class="sp"></span><span class="count" id="planCount"></span></div>
          <div class="pane-body" id="planList"><div class="sk sk-row"></div><div class="sk sk-row"></div></div>
        </section>
        <section class="pane">
          <div class="pane-head"><h2>校验与预览</h2></div>
          <div class="pane-body" id="checkPane"><div class="empty">选择站点后显示</div></div>
        </section>
      </section>

      ${MODULE_PANEL_HTML}
      ${WECHAT_PANEL_HTML}
      ${MEDIA_PANEL_HTML}
      ${FRAGMENTS_PANEL_HTML}
      ${HISTORY_PANEL_HTML}
    </div>
  </div>
</div>

<!-- 知识库抽屉 -->
<div class="drawer-scrim" id="drawerScrim"></div>
<aside class="kb-drawer" id="kbDrawer">
  <div class="kb-resize" id="kbResize" title="拖拽调整宽度"></div>
  <div class="kb-drawer-head">
    <div class="row1">
      <h2>知识库</h2><span class="sp" style="flex:1"></span>
      <span class="count" id="kbCount"></span>
      <button class="kb-close" id="drawerClose" title="关闭">×</button>
    </div>
    <select id="kb"><option value="">全部库</option></select>
    <input type="search" id="q" placeholder="搜索标题 / 摘要…" />
  </div>
  <div class="kb-drawer-body" id="kbList"><div class="sk sk-row"></div><div class="sk sk-row"></div><div class="sk sk-row"></div></div>
</aside>

<!-- 命令面板 -->
<div class="cmdk-scrim" id="cmdkScrim">
  <div class="cmdk">
    <div class="cmdk-input">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="cmdkInput" placeholder="输入命令或搜索页面…" autocomplete="off" />
      <kbd>esc</kbd>
    </div>
    <div class="cmdk-list" id="cmdkList"></div>
  </div>
</div>

<!-- 通用确认弹窗 -->
<div class="modal-scrim" id="modalScrim">
  <div class="modal">
    <h3 id="modalTitle">确认操作</h3>
    <p id="modalBody"></p>
    <div class="modal-summary" id="modalSummary" hidden></div>
    <div class="modal-actions">
      <button id="modalCancel">取消</button>
      <button id="modalOk" class="primary">确认</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

${EDITOR_SCRIPT}

<script>
// 当前登录用户（服务端注入；未开启鉴权时为 null）
window.__USER__ = ${user ? JSON.stringify({ displayName: user.displayName, name: user.name, role: user.role }).replace(/</g, "\\u003c") : "null"};
// 权限（服务端注入）—— 前端据此禁用无权操作，而不是等 403 才发现
window.__PERMS__ = ${JSON.stringify(permissions)};

const $ = (id) => document.getElementById(id);

let sites = [], bases = [], kbItems = [], plan = null, siteId = null;

// ── 工具 ────────────────────────────────────────────────
function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast on" + (isErr ? " err" : "");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = "toast"; }, 2600);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function statusPill(s) {
  if (!s) return '<span class="pill">未知</span>';
  if (["pushed", "pulled", "synced_both", "local_only"].includes(s))
    return '<span class="pill ok">' + esc(s) + '</span>';
  if (s === "conflict") return '<span class="pill err">冲突</span>';
  return '<span class="pill warn">' + esc(s) + '</span>';
}

// ── 知识库抽屉开关 ─────────────────────────────────────
function openDrawer() { $("kbDrawer").classList.add("on"); $("drawerScrim").classList.add("on"); }
function closeDrawer() { $("kbDrawer").classList.remove("on"); $("drawerScrim").classList.remove("on"); }
$("kbToggle").addEventListener("click", openDrawer);
$("drawerClose").addEventListener("click", closeDrawer);
$("drawerScrim").addEventListener("click", closeDrawer);

// 抽屉宽度可拖拽（localStorage 记忆）
(function initDrawerResize() {
  const drawer = $("kbDrawer"), handle = $("kbResize");
  const saved = Number(localStorage.getItem("kbDrawerW"));
  if (saved >= 280 && saved <= 800) drawer.style.width = saved + "px";
  let dragging = false;
  handle.addEventListener("mousedown", (e) => {
    dragging = true; document.body.classList.add("kb-resizing"); e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.min(800, Math.max(280, window.innerWidth - e.clientX));
    drawer.style.width = w + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false; document.body.classList.remove("kb-resizing");
    localStorage.setItem("kbDrawerW", drawer.style.width.replace("px", ""));
  });
})();

// ── 骨架屏：列表加载占位 ───────────────────────────────
function skeleton(el, n) {
  el.innerHTML = Array.from({ length: n ?? 5 }, () => '<div class="sk sk-row"></div>').join("");
}

// ── 通用确认弹窗 ──────────────────────────────────────
let modalOkHandler = null;
function confirmModal({ title, body, summary, okText }) {
  $("modalTitle").textContent = title;
  $("modalBody").textContent = body;
  if (summary) { $("modalSummary").hidden = false; $("modalSummary").innerHTML = summary; }
  else $("modalSummary").hidden = true;
  $("modalOk").textContent = okText ?? "确认";
  $("modalScrim").classList.add("on");
  return new Promise((resolve) => {
    modalOkHandler = () => { closeModal(); resolve(true); };
  });
}
function closeModal() { $("modalScrim").classList.remove("on"); modalOkHandler = null; }
$("modalCancel").addEventListener("click", closeModal);
$("modalScrim").addEventListener("click", (e) => { if (e.target === $("modalScrim")) closeModal(); });
$("modalOk").addEventListener("click", () => { if (modalOkHandler) modalOkHandler(); });

// ── 健康 chips（顶栏状态）──────────────────────────────
function setChips(html) { $("chips").innerHTML = html || ""; }
function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  return (d.getMonth() + 1) + "/" + d.getDate() + " " +
    String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
// 模块面板回调这里。富对象：{ pages, modules, items, draftItems, pending, problems, updatedAt }
window.__setChips = function (s) {
  if (!s) { setChips(""); return; }
  const c = [];
  if (s.pages != null) c.push('<span class="chip">页面 <b>' + s.pages + "</b></span>");
  if (s.modules != null) c.push('<span class="chip">模块 <b>' + s.modules + "</b></span>");
  if (s.items != null) c.push('<span class="chip">条目 <b>' + s.items + "</b></span>");
  if (s.draftItems) c.push('<span class="chip warn">草稿 <b>' + s.draftItems + "</b></span>");
  if (s.pending) c.push('<span class="chip warn" title="待审核条目">待审 <b>' + s.pending + "</b></span>");
  if (s.problems) c.push('<span class="chip err" title="校验问题">问题 <b>' + s.problems + "</b></span>");
  else if (s.problems === 0) c.push('<span class="chip ok" title="校验通过">校验 <b>✓</b></span>');
  if (s.updatedAt) c.push('<span class="chip" title="编排最近更新">更新 <b>' + fmtTime(s.updatedAt) + "</b></span>");
  setChips(c.join(""));
};

// ── 命令面板（⌘K）────────────────────────────────────
const CMDK_COMMANDS = [
  { cat: "导航", label: "跳到 · 内容编排", run: () => switchView("module") },
  { cat: "导航", label: "跳到 · 媒体库", run: () => switchView("media") },
  { cat: "导航", label: "跳到 · 片段库", run: () => switchView("fragments") },
  { cat: "导航", label: "跳到 · 版本历史", run: () => switchView("history") },
  { cat: "导航", label: "跳到 · 公众号排版", run: () => switchView("wechat") },
  { cat: "导航", label: "跳到 · 旧版编排", run: () => switchView("plan") },
  { cat: "操作", label: "打开知识库抽屉", kbd: "⌘K", run: openDrawer },
  { cat: "操作", label: "刷新知识库", run: () => $("reload").click() },
  { cat: "操作", label: "保存当前编排", kbd: "⌘S", run: () => $("save").click() },
];
let cmdkActive = 0, cmdkFiltered = CMDK_COMMANDS;
function openCmdk() {
  $("cmdkScrim").classList.add("on");
  $("cmdkInput").value = "";
  cmdkFiltered = CMDK_COMMANDS; cmdkActive = 0;
  renderCmdk();
  setTimeout(() => $("cmdkInput").focus(), 0);
}
function closeCmdk() { $("cmdkScrim").classList.remove("on"); }
function renderCmdk() {
  const list = $("cmdkList");
  if (!cmdkFiltered.length) { list.innerHTML = '<div class="cmdk-empty">没有匹配的命令</div>'; return; }
  list.innerHTML = cmdkFiltered.map((c, i) =>
    '<div class="cmdk-item' + (i === cmdkActive ? " on" : "") + '" data-i="' + i + '">' +
      '<span class="cmd-cat">' + c.cat + "</span><span>" + c.label + "</span>" +
      (c.kbd ? '<span class="cmd-k">' + c.kbd + "</span>" : "") +
    "</div>").join("");
}
$("cmdkInput").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  cmdkFiltered = CMDK_COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  cmdkActive = 0; renderCmdk();
});
$("cmdkList").addEventListener("click", (e) => {
  const item = e.target.closest(".cmdk-item");
  if (!item) return;
  cmdkFiltered[Number(item.dataset.i)]?.run();
  closeCmdk();
});
$("cmdkInput").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); cmdkActive = Math.min(cmdkActive + 1, cmdkFiltered.length - 1); renderCmdk(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); cmdkActive = Math.max(cmdkActive - 1, 0); renderCmdk(); }
  else if (e.key === "Enter") { e.preventDefault(); cmdkFiltered[cmdkActive]?.run(); closeCmdk(); }
});
$("cmdkScrim").addEventListener("click", (e) => { if (e.target === $("cmdkScrim")) closeCmdk(); });

// ── 全局快捷键 ──────────────────────────────────────
document.addEventListener("keydown", (e) => {
  // ⌘K：命令面板（不是知识库抽屉）
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("cmdkScrim").classList.contains("on") ? closeCmdk() : openCmdk(); return; }
  // ⌘S：保存（旧编排视图）
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (currentView === "plan") $("save").click();
    else if (typeof $("modSave") !== "undefined" && $("modSave")) $("modSave").click();
    return;
  }
  if (e.key === "Escape") { closeDrawer(); closeCmdk(); closeModal(); }
});

// ── 加载 ────────────────────────────────────────────────
async function loadSites() {
  const r = await fetch("/api/sites");
  sites = (await r.json()).sites ?? [];
  const sel = $("site");
  sel.innerHTML = sites.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + " (" + esc(s.id) + ")</option>").join("");
  siteId = sites[0]?.id ?? null;
  $("crumbSite").textContent = sites[0]?.name ?? "未选站点";
  if (siteId) await loadPlan();
}

async function loadKb() {
  const kbId = $("kb").value;
  const r = await fetch("/api/kb" + (kbId ? "?kbId=" + encodeURIComponent(kbId) : ""));
  const d = await r.json();
  if (d.error) { $("kbList").innerHTML = '<div class="empty">' + esc(d.error) + "</div>"; return; }
  bases = d.bases ?? [];
  kbItems = d.items ?? [];

  // 知识库下拉（含隐含的 default）
  const sel = $("kb");
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部库</option>' +
    bases.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + "</option>").join("") +
    '<option value="default">默认库（隐含）</option>';
  if (cur) sel.value = cur;

  renderKb();
  // 编排台要用知识条目来显示标题 —— 知识库加载完必须重渲染一次，
  // 否则编排台只能显示 itemId（当时 kbItems 还是空的）
  renderPlan();
}

async function loadPlan() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/plan");
  const d = await r.json();
  plan = d.plan ?? { version: 1, siteId, kbId: "default", updatedAt: "", entries: [] };
  renderPlan();
  await runCheck();
}

// ── 渲染 ────────────────────────────────────────────────
function renderKb() {
  const q = $("q").value.trim().toLowerCase();
  const list = kbItems.filter((i) =>
    !q || (i.title + " " + (i.summary ?? "")).toLowerCase().includes(q));
  $("kbCount").textContent = list.length + " / " + kbItems.length + " 条";

  if (!list.length) { $("kbList").innerHTML = '<div class="empty">没有匹配的条目</div>'; return; }

  const chosen = new Set((plan?.entries ?? []).map((e) => e.itemId));
  // 模块视图下，「加入编排」换成「加入模块」—— 内容来源同样是知识库，
  // 但落到「页面 → 模块 → 条目」的树里。
  const moduleView = typeof currentView !== "undefined" && currentView === "module";
  $("kbList").innerHTML = list.map((i) => {
    const inPlan = chosen.has(i.id);
    const action = moduleView
      ? '<button data-modadd="' + esc(i.id) + '">加入模块</button>'
      : '<button data-add="' + esc(i.id) + '"' + (inPlan ? " disabled" : "") + ">" +
        (inPlan ? "已加入" : "加入编排") + "</button>";
    return '<div class="row">' +
      '<div class="t">' + esc(i.title) + "</div>" +
      '<div class="m">' + statusPill(i.sync_status) +
      (i.summary ? "<span>" + esc(i.summary.slice(0, 46)) + (i.summary.length > 46 ? "…" : "") + "</span>" : "") +
      (i.tags ? "<span>" + i.tags.slice(0, 3).map(esc).join(" · ") + "</span>" : "") +
      "</div>" +
      '<div class="m" style="margin-top:6px">' +
      action +
      '<button data-viewitem="' + esc(i.id) + '">看正文</button>' +
      "</div></div>";
  }).join("");
}

function renderPlan() {
  const entries = (plan?.entries ?? []).slice().sort((a, b) => a.order - b.order);
  const pub = entries.filter((e) => e.published).length;
  $("planCount").textContent = pub + " 已发布 / " + entries.length + " 条";

  if (!entries.length) {
    $("planList").innerHTML = '<div class="empty">从右上角「知识库」拉抽屉挑内容加入<br/>加入后在这里定位置、排序、定稿</div>';
    return;
  }

  $("planList").innerHTML = entries.map((e) => {
    const item = kbItems.find((i) => i.id === e.itemId);
    const title = e.title ?? item?.title ?? e.itemId;
    return '<div class="row" data-id="' + esc(e.itemId) + '">' +
      '<div class="t"><span class="drag">⠿</span> ' + esc(title) + "</div>" +
      '<div class="m">' +
      (e.published ? '<span class="pill ok">已发布</span>' : '<span class="pill warn">草稿</span>') +
      '<span class="pill">序 ' + e.order + "</span>" +
      (item?.sync_status === "conflict" ? '<span class="pill err">冲突</span>' : "") +
      "</div>" +
      '<div class="slot">' +
      '<select data-field="slot">' +
      ["insights", "faq", "products", "cases"].map((s) =>
        '<option value="' + s + '"' + (e.slot === s ? " selected" : "") + ">" +
        ({ insights: "洞察文章", faq: "常见问题", products: "产品", cases: "案例" }[s]) + "</option>").join("") +
      "</select>" +
      '<input class="grow" data-field="title" placeholder="标题（留空用原文）" value="' + esc(e.title ?? "") + '" />' +
      '<input class="grow" data-field="order" type="number" value="' + e.order + '" style="width:64px" title="排序" />' +
      '<button data-toggle="' + esc(e.itemId) + '">' + (e.published ? "转草稿" : "定稿") + "</button>" +
      '<button data-up="' + esc(e.itemId) + '">↑</button>' +
      '<button data-down="' + esc(e.itemId) + '">↓</button>' +
      '<button data-del="' + esc(e.itemId) + '">移除</button>' +
      "</div></div>";
  }).join("");
}

async function runCheck() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/preview", { method: "POST" });
  const d = await r.json();
  if (d.error) { $("checkPane").innerHTML = '<div class="empty">' + esc(d.error) + "</div>"; return; }

  const problems = d.problems ?? [];
  let html = "";
  if (!problems.length) {
    html += '<div class="problem ok">校验通过 —— 可以发布</div>';
  } else {
    html += '<div class="problem">发现 ' + problems.length + " 个问题：</div>";
    for (const p of problems) html += '<div class="problem warn">' + esc(p) + "</div>";
  }
  if ((d.skipped ?? []).length) {
    html += '<div class="problem warn">' + d.skipped.length + " 条被跳过（知识库中已不存在）</div>";
  }

  const counts = [
    ["洞察文章", (d.insights ?? []).length],
    ["常见问题", (d.faq ?? []).length],
    ["产品", (d.products ?? []).length],
    ["案例", (d.cases ?? []).length],
  ];
  html += '<div class="row" style="margin-top:12px"><div class="t">合并后的站点内容</div><div class="m">' +
    counts.map(([k, v]) => "<span>" + k + " " + v + "</span>").join("") + "</div></div>";

  // 需补齐的关键字段 —— **只看计划产生的内容**。
  const planned = d.planned ?? { insights: [], faq: [], products: [], cases: [] };
  const needMore = [...(planned.cases ?? []), ...(planned.products ?? [])];
  if (needMore.length) {
    html += '<div class="row"><div class="t">需补齐的关键字段（来自知识库编排）</div>';
    for (const x of needMore) {
      html += '<div class="m" style="margin-top:6px"><code>' + esc(x.id) + "</code> " + esc(x.title ?? x.name ?? "") +
        '<span class="pill ' + (x.client ? "ok" : "err") + '">' + (x.client ? "客户名 ✓" : "缺客户名") + "</span>" +
        '<span class="pill ' + ((x.results ?? []).length ? "ok" : "err") + '">' + ((x.results ?? []).length ? "结果 ✓" : "缺量化结果") + "</span>" +
        "</div>";
    }
    html += "</div>";
  }

  $("checkPane").innerHTML = html;
}

// ── 交互 ────────────────────────────────────────────────
$("site").addEventListener("change", async (e) => {
  siteId = e.target.value;
  const s = sites.find((x) => x.id === siteId);
  $("crumbSite").textContent = s?.name ?? siteId;
  await loadPlan();
});

$("kb").addEventListener("change", loadKb);
$("q").addEventListener("input", renderKb);

$("reload").addEventListener("click", async () => {
  await fetch("/api/kb/refresh", { method: "POST" });
  await loadKb();
  toast("知识库已刷新");
});

$("kbList").addEventListener("click", async (e) => {
  const addId = e.target.dataset?.add;
  if (addId) {
    plan.entries.push({
      itemId: addId,
      slot: "insights",
      order: plan.entries.length + 1,
      published: false,
    });
    renderKb(); renderPlan();
    return;
  }
  // 模块视图：把知识条目加进当前选中的模块
  const modAddId = e.target.dataset?.modadd;
  if (modAddId) {
    if (window.__modAddKbItem) window.__modAddKbItem(modAddId);
    return;
  }
  const viewId = e.target.dataset?.viewitem;
  if (viewId) {
    const r = await fetch("/api/kb/item/" + encodeURIComponent(viewId));
    const it = await r.json();
    alert((it.title ?? "") + "\\n\\n" + (it.content ?? ""));
  }
});

$("planList").addEventListener("click", async (e) => {
  const id = e.target.dataset?.del ?? e.target.dataset?.toggle ?? e.target.dataset?.up ?? e.target.dataset?.down;
  if (!id) return;
  const idx = plan.entries.findIndex((x) => x.itemId === id);
  if (idx < 0) return;
  const entry = plan.entries[idx];

  if (e.target.dataset.del) plan.entries.splice(idx, 1);
  else if (e.target.dataset.toggle) entry.published = !entry.published;
  else if (e.target.dataset.up) {
    const prev = plan.entries.findIndex((x) => x.order < entry.order);
    if (prev >= 0) { const a = plan.entries[prev].order; plan.entries[prev].order = entry.order; entry.order = a; }
  } else if (e.target.dataset.down) {
    const next = plan.entries.findIndex((x) => x.order > entry.order);
    if (next >= 0) { const a = plan.entries[next].order; plan.entries[next].order = entry.order; entry.order = a; }
  }
  renderPlan(); renderKb();
});

$("planList").addEventListener("change", (e) => {
  const row = e.target.closest(".row");
  if (!row) return;
  const id = row.dataset.id;
  const entry = plan.entries.find((x) => x.itemId === id);
  if (!entry) return;
  const field = e.target.dataset.field;
  if (field === "slot") entry.slot = e.target.value;
  else if (field === "title") entry.title = e.target.value || undefined;
  else if (field === "order") entry.order = Number(e.target.value) || 0;
  renderPlan();
});

$("save").addEventListener("click", async () => {
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
  const d = await r.json();
  if (d.error) toast(d.error, true); else toast("计划已保存 → plan.json");
});

$("publish").addEventListener("click", async () => {
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/publish", { method: "POST" });
  const d = await r.json();
  if (d.error) { toast(d.error, true); return; }
  if ((d.problems ?? []).length) {
    toast("有 " + d.problems.length + " 个问题未解决 —— 见右栏", true);
  } else {
    toast("已发布 → " + d.written);
  }
  await runCheck();
});

(async () => {
  await loadSites();
  await loadKb();
})();

// 登录状态（服务端注入 __USER__；未开启鉴权时为 null）
if (window.__USER__) {
  const who = $("who");
  const name = window.__USER__.displayName || window.__USER__.name;
  const label = document.createElement("span");
  label.textContent = name;
  who.appendChild(label);
  if (window.__USER__.role) {
    const tag = document.createElement("span");
    tag.className = "role-tag";
    tag.textContent = window.__USER__.role;
    tag.title = "你的角色 —— 权限由角色决定";
    who.appendChild(tag);
  }
  const btn = document.createElement("button");
  btn.textContent = "退出";
  btn.addEventListener("click", () => { location.href = "/logout"; });
  who.appendChild(btn);
}
</script>

${MODULE_PANEL_SCRIPT}

${WECHAT_PANEL_SCRIPT}

${MEDIA_PANEL_SCRIPT}

${FRAGMENTS_PANEL_SCRIPT}

${HISTORY_PANEL_SCRIPT}

<script>
// ── 视图切换 ────────────────────────────────────────────
let currentView = "module";

const VIEW_TITLE = {
  module: "内容编排",
  plan: "旧版编排（固定槽位）",
  media: "媒体库",
  fragments: "片段库",
  history: "版本历史",
  wechat: "公众号排版",
};

function switchView(v) {
  currentView = v;
  // 面板显隐
  $("planView").hidden = v !== "plan";
  $("modulePane").hidden = v !== "module";
  $("wechatPane").hidden = v !== "wechat";
  $("mediaPane").hidden = v !== "media";
  $("fragmentsPane").hidden = v !== "fragments";
  $("historyPane").hidden = v !== "history";
  // 侧边栏高亮
  document.querySelectorAll(".nav button[data-view]").forEach((b) =>
    b.classList.toggle("on", b.dataset.view === v));
  // 面包屑
  $("crumbView").textContent = VIEW_TITLE[v] ?? v;
  // 旧编排专属按钮在其它视图下无意义
  $("save").hidden = v !== "plan";
  $("publish").hidden = v !== "plan";

  if (v === "module") loadModules();
  if (v === "media") { if (typeof loadMedia === "function") loadMedia(); }
  if (v === "fragments") { if (typeof loadFragments === "function") loadFragments(); }
  if (v === "history") { if (typeof loadHistory === "function") loadHistory(); }
  if (v === "wechat") {
    if (typeof loadModules === "function" && !modPlan) loadModules();
    if (typeof wcRenderSide === "function") { wcRenderSide(); wcRenderPreview(); }
  }
  // 知识库列表的按钮随视图变化（「加入编排」↔「加入模块」）
  renderKb();
}

document.querySelectorAll(".nav button[data-view]").forEach((b) =>
  b.addEventListener("click", () => switchView(b.dataset.view)));

// 模块面板的绑定（在 MODULE_PANEL_SCRIPT 之后执行）
if (typeof bindModulePanel === "function") bindModulePanel();
// 公众号排版面板的绑定（在 WECHAT_PANEL_SCRIPT 之后执行）
if (typeof bindWechatPanel === "function") bindWechatPanel();
// 媒体库面板的绑定（在 MEDIA_PANEL_SCRIPT 之后执行）
if (typeof bindMediaPanel === "function") bindMediaPanel();
// 片段面板的绑定（在 FRAGMENTS_PANEL_SCRIPT 之后执行）
if (typeof bindFragmentsPanel === "function") bindFragmentsPanel();
// 版本面板的绑定（在 HISTORY_PANEL_SCRIPT 之后执行）
if (typeof bindHistoryPanel === "function") bindHistoryPanel();

// 默认进入「内容编排」
switchView("module");
</script>
</body>
</html>
`;
}
