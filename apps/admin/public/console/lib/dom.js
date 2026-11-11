/**
 * DOM 小工具 —— 零依赖。
 *
 * 全站只用这一套建 DOM 的手法：
 *   h("div", { class: "card" }, 子节点...)
 * 不用 innerHTML 拼字符串 —— 内容里出现 < > 就再也不用担心 XSS 与转义。
 */

/** 建元素。props 里的 on* 是事件，style 是对象，dataset 是对象，其余走 setAttribute/property */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k in el && k !== "list" && k !== "type") {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? "" : v);
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false || c === "") continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/* ── 图标（单一库：Lucide 风格的线性描边，1.5px）────────── */
const PATHS = {
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 21v-7h6v7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.5-4.5L6 21"/>',
  block: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9.5" cy="14.5" r="1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  undo: '<path d="M3 10h11a5 5 0 0 1 0 10H8"/><path d="m3 10 4-4"/><path d="m3 10 4 4"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  save: '<path d="M4 4h13l3 3v13H4Z"/><path d="M8 4v6h7V4"/><path d="M8 20v-6h8v6"/>',
  text: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h13"/>',
  heading: '<path d="M5 4v16"/><path d="M15 4v16"/><path d="M5 12h10"/>',
  list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  quote: '<path d="M8 7H5v6h5V9"/><path d="M18 7h-3v6h5V9"/>',
  code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/>',
  file: '<path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 11h18"/>',
  split: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  book: '<path d="M4 4h7v16H4z"/><path d="M13 4h7v16h-7z"/>',
};

export function icon(name, size = 15, extraClass = "") {
  const p = PATHS[name] ?? PATHS.info;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (extraClass) svg.setAttribute("class", extraClass);
  svg.innerHTML = p;
  return svg;
}

/* ── 格式化 ─────────────────────────────────────────────── */
export function relTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}

export function fullTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function bytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function debounce(fn, ms = 300) {
  let t = 0;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 路径 → 面包屑式的段 */
export function pathLabel(p) {
  if (!p || p === "/") return "/";
  return p;
}

/* ── toast ─────────────────────────────────────────────── */
let toastStack = null;
function ensureToasts() {
  if (!toastStack) {
    toastStack = h("div", { class: "toast-stack", role: "status", "aria-live": "polite" });
    document.body.appendChild(toastStack);
  }
  return toastStack;
}

export function toast(message, opts = {}) {
  const { kind = "", actionLabel = "", onAction = null, timeout = 3200 } = opts;
  const stack = ensureToasts();
  const node = h(
    "div",
    { class: `toast ${kind ? `toast--${kind}` : ""}` },
    h("span", { text: message }),
    actionLabel
      ? h("button", {
          type: "button",
          text: actionLabel,
          onclick: () => {
            node.remove();
            onAction?.();
          },
        })
      : null,
  );
  stack.appendChild(node);
  if (timeout) setTimeout(() => node.remove(), timeout);
  return node;
}

/* ── 对话框（替代 confirm / prompt）────────────────────── */
export function dialog({
  title,
  body,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  input = null,
  onConfirm,
}) {
  const scrim = h("div", { class: "scrim", role: "presentation" });
  let field = null;
  const foot = h(
    "div",
    { class: "dialog__foot" },
    h("span", { class: "sp" }),
    h("button", {
      class: "btn",
      type: "button",
      text: cancelLabel,
      onclick: () => close(),
    }),
    h("button", {
      class: `btn ${danger ? "btn--stamp" : "btn--ink"}`,
      type: "button",
      text: confirmLabel,
      onclick: () => {
        const value = field ? field.value.trim() : undefined;
        if (input?.required && !value) {
          field.focus();
          field.style.borderColor = "var(--stamp)";
          return;
        }
        close();
        onConfirm?.(value);
      },
    }),
  );

  if (input) {
    field = h("input", {
      class: "input",
      value: input.value ?? "",
      placeholder: input.placeholder ?? "",
      "aria-label": input.label ?? title,
    });
  }

  const box = h(
    "div",
    { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "dialog__head" }, h("h2", { text: title })),
    h(
      "div",
      { class: "dialog__body" },
      body ? (typeof body === "string" ? h("p", { text: body }) : body) : null,
      field ? h("div", { style: { marginTop: "12px" } }, field) : null,
    ),
    foot,
  );

  scrim.appendChild(box);
  scrim.addEventListener("mousedown", (e) => {
    if (e.target === scrim) close();
  });
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && field) foot.querySelector(".btn--ink, .btn--stamp")?.click();
  };
  document.addEventListener("keydown", onKey);

  function close() {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
    if (document.querySelectorAll(".scrim").length === 0) document.body.style.overflow = "";
  }
  document.body.appendChild(scrim);
  document.body.style.overflow = "hidden";
  (field ?? foot.querySelector(".btn--ink, .btn--stamp"))?.focus();
  return { close };
}

/* ── 抽屉 ─────────────────────────────────────────────── */
export function drawer({ title, subtitle, body, foot, onClose, width }) {
  const scrim = h("div", { class: "scrim", style: { placeItems: "stretch", display: "block" } });
  const panel = h(
    "aside",
    {
      class: "drawer",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
      style: width ? { width } : null,
    },
    h(
      "div",
      { class: "drawer__head" },
      h(
        "div",
        { class: "stack", style: { minWidth: 0 } },
        h("h2", { text: title }),
        subtitle ? h("p", { class: "muted", style: { fontSize: "12px" }, text: subtitle }) : null,
      ),
      h("span", { class: "sp" }),
      h("button", {
        class: "btn btn--ghost btn--icon",
        type: "button",
        "aria-label": "关闭",
        onclick: () => close(),
      }, icon("x", 16)),
    ),
    h("div", { class: "drawer__body" }, body),
    foot ? h("div", { class: "drawer__foot" }, foot) : null,
  );

  scrim.appendChild(panel);
  scrim.addEventListener("mousedown", (e) => {
    if (e.target === scrim) close();
  });
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  function close() {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
    onClose?.();
  }
  document.body.appendChild(scrim);
  return { close, panel };
}

/* ── 状态块 ───────────────────────────────────────────── */
export function loadingRows(n = 6) {
  return h(
    "div",
    { style: { padding: "8px 0" }, "aria-busy": "true" },
    ...Array.from({ length: n }, (_, i) =>
      h("div", {
        class: "skel skel--row",
        style: { width: `${92 - (i % 3) * 13}%` },
      }),
    ),
  );
}

export function empty({ title, text, action, mark = "file" }) {
  return h(
    "div",
    { class: "empty" },
    h("div", { class: "empty__mark" }, icon(mark, 18)),
    h("h3", { text: title }),
    text ? h("p", { text }) : null,
    action ?? null,
  );
}

export function stamp(review) {
  const map = {
    pending: ["待审", "stamp--pending"],
    approved: ["已通过", "stamp--approved"],
    rejected: ["已驳回", "stamp--rejected"],
  };
  const [label, cls] = map[review] ?? ["未审", ""];
  return h("span", { class: `stamp ${cls}`, text: label });
}

export function tag(text, kind = "") {
  return h("span", { class: `tag ${kind ? `tag--${kind}` : ""}`, text });
}
