/**
 * 拖拽排序 —— 原生 HTML5 DnD，零依赖。
 *
 * 旧界面画了 ⠿ 抓手却不响应拖拽，只有 ↑↓ 按钮 —— 手感和外观不一致，
 * 用户会先试着拖一下，失败后对整个后台失去信任。这里让它真的能拖。
 */

export function sortable(container, itemSelector, { handle = null, onDrop } = {}) {
  let dragEl = null;

  const itemOf = (node) => node?.closest?.(itemSelector) ?? null;

  container.addEventListener("dragstart", (e) => {
    const item = itemOf(e.target);
    if (!item) return;
    if (handle && !e.target.closest(handle)) {
      e.preventDefault();
      return;
    }
    dragEl = item;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.dataset.dragId ?? "");
  });

  container.addEventListener("dragend", () => {
    dragEl?.classList.remove("dragging");
    clearLine();
    dragEl = null;
  });

  container.addEventListener("dragover", (e) => {
    if (!dragEl) return;
    const over = itemOf(e.target);
    if (!over || over === dragEl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    clearLine();
    const line = document.createElement("div");
    line.className = "drop-line";
    if (after) over.after(line);
    else over.before(line);
  });

  container.addEventListener("drop", (e) => {
    if (!dragEl) return;
    const over = itemOf(e.target);
    if (!over || over === dragEl) return;
    e.preventDefault();
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const from = dragEl.dataset.dragId;
    const to = over.dataset.dragId;
    clearLine();
    dragEl.classList.remove("dragging");
    dragEl = null;
    if (from && to && from !== to) onDrop?.(from, to, after);
  });

  function clearLine() {
    container.querySelectorAll(".drop-line").forEach((l) => l.remove());
  }
}
