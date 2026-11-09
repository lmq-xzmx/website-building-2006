/**
 * robots.txt 解析 —— 独立模块，避免 scorer 与 index 之间的循环引用。
 */

/**
 * 解析 robots.txt 为 UA 组。
 *
 * robots.txt 规范：**连续的** User-agent 行属于同一组；
 * 一旦出现过规则行，下一个 User-agent 行就开新组。
 */
export function parseRobotsGroups(
  robotsTxt: string,
): Array<{ agents: string[]; rules: string[] }> {
  const groups: Array<{ agents: string[]; rules: string[] }> = [];
  let current: { agents: string[]; rules: string[] } | null = null;

  for (const raw of robotsTxt.split("\n")) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const m = line.match(/^user-agent:\s*(.+)$/i);
    if (m) {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(m[1].trim().toLowerCase());
      continue;
    }
    const r = line.match(/^(allow|disallow):\s*(.*)$/i);
    if (r && current) {
      current.rules.push(`${r[1].toLowerCase()}:${r[2].trim()}`);
    }
  }

  return groups;
}

/**
 * 判断某个 UA 组是否被整体屏蔽。
 *
 * 用于 nosnippet 这类「指令型 UA」的精确判定 ——
 * 「User-agent: nosnippet」本身不是禁止，只有该组里的 Disallow 才是。
 */
export function isAgentGroupDisallowed(robotsTxt: string, ua: string): boolean {
  const target = ua.toLowerCase();
  const group = parseRobotsGroups(robotsTxt).find((g) => g.agents.includes(target));
  if (!group) return false;
  return group.rules.some((r) => {
    const [kind, ...rest] = r.split(":");
    const path = rest.join(":");
    return kind === "disallow" && path !== "";
  });
}

/**
 * 判断某个 UA 是否被 robots.txt 允许。
 *
 * 规则：找到该 UA 的专属段落，用其中的 Allow/Disallow 判定；
 * 没有专属段落则回落到 `User-agent: *` 段落。
 */
export function evaluateCrawlerAllowed(robotsTxt: string, ua: string): boolean {
  const target = ua.toLowerCase();
  const groups = parseRobotsGroups(robotsTxt);
  const specific = groups.find((g) => g.agents.includes(target));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const group = specific ?? wildcard;
  if (!group) return true;

  // 长路径优先（robots.txt 标准语义）
  let best: { path: string; allow: boolean } | null = null;
  for (const rule of group.rules) {
    const [kind, ...rest] = rule.split(":");
    const path = rest.join(":");
    if (kind === "disallow" && path === "") continue; // 空 Disallow = 允许全部
    if (!best || path.length > best.path.length) {
      best = { path, allow: kind === "allow" };
    }
  }
  if (!best) return true;
  return best.allow;
}
