"use client";

import { useState } from "react";

/**
 * 询盘表单 —— Phase 3 接 CRM 的前端桩。
 *
 * 当前实现：提交到配置的 endpoint（默认 /api/inquiry）。
 * Phase 3 落地时，服务端路由把询盘转成 CRM 线索（走 X-API-Key）。
 *
 * 静态导出下的关键约束：
 *   表单提交**必须**走外部 API —— 纯静态站没有服务端路由。
 *   若部署到静态托管，endpoint 需指向 CRM 网关或 Serverless 函数。
 */
export default function InquiryForm({ endpoint }: { endpoint?: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch(endpoint ?? "/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
