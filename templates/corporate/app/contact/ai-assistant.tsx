"use client";

import { useState } from "react";

/**
 * 站内 AI 客服（数字分身）—— 前端组件。
 *
 * 架构约束（ADR-000 决策 3 的推论）：
 *   - 纯静态站没有服务端，推理必须在**外部端点**
 *   - API Key 绝不进前端 —— 浏览器只与边缘函数对话
 *   - 未配置端点时组件自动隐藏（不给客户一个点了没反应的假入口）
 */
const ENDPOINT = process.env.NEXT_PUBLIC_CHAT_ENDPOINT;

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "bot"; text: string }>>([]);
  const [busy, setBusy] = useState(false);

  // 未配置端点 —— 不渲染这个组件。
  //
  // 两个细节：
  // 1. 用局部常量：模块级 const 在闭包内 TS 不做类型收窄
  // 2. ask 用箭头函数且置于守卫之后：函数声明会提升，TS 在其内部不保留守卫的收窄
  const endpoint = ENDPOINT;
  if (!endpoint) return null;

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;

    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setBusy(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { answer?: string };
      setMessages((m) => [
        ...m,
        { role: "bot", text: data.answer ?? "暂时无法回答，请联系我们。" },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "服务暂时不可用，请直接联系我们。" },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-assistant">
      {!open ? (
        <button
          type="button"
          className="btn btn-primary ai-assistant-launch"
          onClick={() => setOpen(true)}
        >
          AI 客服
        </button>
      ) : (
        <div className="ai-panel">
          <div className="ai-panel-head">
            <strong>AI 客服</strong>
            <button type="button" className="ai-close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div className="ai-messages">
            {messages.length === 0 && (
              <p className="ai-hint">
                问我产品参数、价格、交付周期。回答均来自官网内容，可溯源。
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg-${m.role}`}>
                {m.text}
              </div>
            ))}
            {busy && <div className="ai-msg ai-msg-bot">思考中…</div>}
          </div>

          <form onSubmit={ask} className="ai-input-row">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入你的问题…"
              aria-label="提问"
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              发送
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
