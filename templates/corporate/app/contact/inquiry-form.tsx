"use client";

import { useState } from "react";

/**
 * 询盘表单 —— 提交到**外部**端点（Phase 3）。
 *
 * 关键约束：客户站是纯静态的，没有服务端路由。
 * 所以 endpoint 必须指向外部网关（Vercel Edge / Cloudflare Worker /
 * 自建转发服务），由它负责转成 CRM 的 GEO Lead。
 *
 * 环境变量 NEXT_PUBLIC_INQUIRY_ENDPOINT 指定目标；
 * 未配置时降级为 mailto —— 保证表单永远不会「点了没反应」。
 */
const DEFAULT_ENDPOINT = process.env.NEXT_PUBLIC_INQUIRY_ENDPOINT;

export default function InquiryForm({ endpoint }: { endpoint?: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const target = endpoint ?? DEFAULT_ENDPOINT;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    // 未配置外部端点 —— 降级为 mailto，绝不静默失败
    if (!target) {
      const subject = encodeURIComponent(`建站询盘 - ${data.company}`);
      const body = encodeURIComponent(
        `姓名：${data.name}\n公司：${data.company}\n电话：${data.phone}\n邮箱：${data.email}\n\n需求：${data.message}`,
      );
      window.location.href = `mailto:sales@example.com?subject=${subject}&body=${body}`;
      return;
    }

    setStatus("sending");
    setMessage("");

    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          sourceUrl: window.location.href,
          siteId: process.env.NEXT_PUBLIC_SITE_ID,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("ok");
      setMessage("已收到，我们会在 1 个工作日内与您联系。");
      form.reset();
    } catch (err) {
      setStatus("error");
      setMessage(
        `提交失败：${err instanceof Error ? err.message : "未知错误"}。请直接致电或发送邮件给我们。`,
      );
    }
  }

  return (
    <form className="inquiry-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="inq-name">姓名 *</label>
        <input id="inq-name" name="name" type="text" required autoComplete="name" />
      </div>

      <div className="field">
        <label htmlFor="inq-company">公司名称 *</label>
        <input id="inq-company" name="company" type="text" required autoComplete="organization" />
      </div>

      <div className="field">
        <label htmlFor="inq-phone">联系电话 *</label>
        <input id="inq-phone" name="phone" type="tel" required autoComplete="tel" />
      </div>

      <div className="field">
        <label htmlFor="inq-email">邮箱 *</label>
        <input id="inq-email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="field">
        <label htmlFor="inq-need">需求描述 *</label>
        <textarea
          id="inq-need"
          name="message"
          required
          placeholder="请描述设备类型、数量与交付时间要求，便于我们给出准确报价。"
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
        {status === "sending" ? "提交中…" : "提交询盘"}
      </button>

      {message && (
        <p className="form-note" role="status">
          {message}
        </p>
      )}

      <p className="form-note">我们只用您留下的信息做本次报价沟通，不会发送营销邮件。</p>
    </form>
  );
}
