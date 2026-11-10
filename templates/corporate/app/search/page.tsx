"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { searchIndex } from "@geokit/geo-kit/search";
import type { SearchIndex, SearchIndexEntry } from "@geokit/geo-kit/search";

/**
 * 站内搜索页 —— **纯客户端**。
 *
 * 静态导出站没有服务端，搜索只能是：
 *   fetch 构建期生成的 search-index.json → 浏览器本地过滤 → 渲染结果。
 * 索引文件由 scripts/build-site.mjs 在构建期从合并后的内容模型生成。
 *
 * 为什么用 geo-kit 的 searchIndex 而不是自己写：
 *   排序权重（标题 > 摘要 > 正文）与片段截取逻辑**只有一份**，
 *   后台预览与前台搜索看到的排序完全一致。
 *
 * 索引文件不存在时（站点没构建过 / 构建失败）给友好提示，不白屏。
 */

type LoadState = "loading" | "ready" | "missing";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [anyMode, setAnyMode] = useState(true);
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<SearchIndexEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch("/search-index.json")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: SearchIndex) => {
        if (cancelled) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchIndex(items, query, { mode: anyMode ? "any" : "all" });
  }, [items, query, anyMode]);

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>站内搜索</h1>
          <p>搜索产品、案例、洞察与常见问题。多个关键词用空格分隔。</p>
        </div>

        {/* ── 搜索框 ── */}
        <div className="search-box">
          <div className="field">
            <label htmlFor="site-search">关键词</label>
            <input
              id="site-search"
              type="search"
              value={query}
              placeholder="例如：私有化部署 审计日志"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <label className="search-mode">
            <input
              type="checkbox"
              checked={anyMode}
              onChange={(e) => setAnyMode(e.target.checked)}
            />
            <span>任一关键词命中即可（关闭则要求全部命中）</span>
          </label>
        </div>

        {/* ── 状态 ── */}
        {state === "loading" && <p className="form-note">正在加载索引…</p>}

        {state === "missing" && (
          <div className="card">
            <h3>搜索索引尚未生成</h3>
            <p>
              站内搜索依赖构建期生成的 <code>search-index.json</code>。
              该文件缺失通常意味着站点还没构建过，或构建过程未完成 ——
              请重新构建站点后再试。
            </p>
            <Link href="/" className="btn btn-outline">
              返回首页
            </Link>
          </div>
        )}

        {state === "ready" && !query.trim() && (
          <p className="form-note">输入关键词开始搜索。</p>
        )}

        {state === "ready" && query.trim() && results.length === 0 && (
          <div className="card">
            <h3>没有找到相关内容</h3>
            <p>
              换个关键词试试，或者直接
              <Link href="/contact">联系我们</Link>。
            </p>
          </div>
        )}

        {/* ── 结果 ── */}
        {results.length > 0 && (
          <>
            <p className="form-note">
              找到 {results.length} 条结果
              {anyMode ? "（任一命中）" : "（全部命中）"}
            </p>
            <div className="grid grid-2">
              {results.map((r) => (
                <article className="card" key={r.entry.id}>
                  <h3>
                    <Link href={r.entry.path}>{r.entry.title || r.entry.pageTitle}</Link>
                  </h3>
                  <div className="article-meta">
                    <span>{r.entry.pageTitle}</span>
                    <span className="tag">{r.entry.moduleType}</span>
                  </div>
                  {r.entry.summary && <p>{r.entry.summary}</p>}
                  {r.snippet.length > 0 && (
                    <p className="search-snippet">
                      {r.snippet.map((seg, i) =>
                        seg.hit ? (
                          <mark key={i}>{seg.text}</mark>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
