/**
 * 数字分身 / 站内 AI 客服（Phase 2 B 类）。
 *
 * 架构约束（ADR-000 决策 3 的关键推论）：
 *   客户站是**纯静态**的 —— 没有服务端进程。
 *   所以「站内 AI 客服」的知识库必须能从**静态产物**里直接读出来，
 *   由外部 API（CRM 网关 / Serverless / 边缘函数）承载推理。
 *
 *   本模块负责的是**知识库侧**：把内容索引转成可被检索的文档集合，
 *   并给出「问什么 → 检索什么 → 怎么答」的完整链路。
 *
 *   推理端（LLM 调用）留在服务端 —— API Key 绝不进前端。
 *
 * 检索策略：**关键词 + 术语**的确定性打分，不用向量库。
 *   理由：
 *   1. 静态站没有 embedding 服务可用（纯静态约束）；
 *   2. 企业站内容规模小（几十页），关键词检索足够；
 *   3. 可解释 —— 客户问「你们的采集器支持多少数据点」，
 *      应该能明确指出答案来自哪个产品的哪个参数。
 *   4. 零依赖 —— 客户站不需要额外基础设施。
 *
 *   向量检索留作接口预留（RetrievalProvider 可替换）。
 */

import { buildContentIndex } from "../content-index.js";
import type { FaqItem } from "../types.js";
import type { SiteContent } from "../types.js";

/** 可检索的文档单元 */
export interface KnowledgeDoc {
  id: string;
  /** 文档类型 */
  kind: "section" | "product" | "case" | "insight" | "faq" | "organization";
  title: string;
  /** 全文（用于喂给 LLM） */
  text: string;
  /** 关键词（用于检索打分） */
  keywords: string[];
  /** 来源区块 id */
  sectionId?: string;
  /** URL —— 引用时给出，让答案可溯源 */
  url?: string;
}

/** 检索结果 */
export interface RetrievalHit {
  doc: KnowledgeDoc;
  score: number;
  /** 命中的关键词 */
  matched: string[];
}

export interface RetrievalOptions {
  /** 返回条数上限 */
  topK?: number;
  /** 最低分 —— 低于此分视为「无答案」 */
  minScore?: number;
}

/**
 * 把内容包转成知识库文档集合。
 *
 * 文档粒度 = AI 引用粒度。
 * 段落级太碎、产品级太粗 —— 区块级最合适：
 * 一个区块对应一个可独立引用的信息单元。
 */
export function buildKnowledgeBase(content: SiteContent): KnowledgeDoc[] {
  const index = buildContentIndex(content);
  const docs: KnowledgeDoc[] = [];

  // 区块文档
  for (const entry of index.entries) {
    const section = content.sections.find((s) => s.id === entry.sectionId);
    if (!section) continue;

    const parts: string[] = [];
    if (section.subtitle) parts.push(section.subtitle);
    for (const p of section.body ?? []) parts.push(p);
    for (const b of section.bullets ?? []) parts.push(b);

    docs.push({
      id: `section:${section.id}`,
      kind: "section",
      title: section.title,
      text: parts.join("\n"),
      keywords: extractKeywords(section.title, parts.join(" ")),
      sectionId: section.id,
      url: entry.url,
    });
  }

  // 产品文档 —— 参数是 AI 最爱引用的
  for (const p of content.products ?? []) {
    const parts: string[] = [];
    if (p.summary) parts.push(p.summary);
    if (p.description) parts.push(p.description);
    for (const spec of p.specs ?? []) {
      parts.push(`${spec.name}：${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`);
    }
    for (const h of p.highlights ?? []) parts.push(h);

    docs.push({
      id: `product:${p.id}`,
      kind: "product",
      title: p.name,
      text: parts.join("\n"),
      keywords: extractKeywords(p.name, parts.join(" ")),
      url: content.url,
    });
  }

  // 案例文档 —— 量化结果
  for (const c of content.cases ?? []) {
    const parts: string[] = [];
    if (c.client) parts.push(`客户：${c.client}`);
    if (c.industry) parts.push(`行业：${c.industry}`);
    if (c.challenge) parts.push(`面临的问题：${c.challenge}`);
    if (c.solution) parts.push(`解决方案：${c.solution}`);
    for (const r of c.results ?? []) parts.push(r);

    docs.push({
      id: `case:${c.id}`,
      kind: "case",
      title: c.title,
      text: parts.join("\n"),
      keywords: extractKeywords(c.title, parts.join(" ")),
      url: content.url,
    });
  }

  // 文章文档
  for (const a of content.insights ?? []) {
    const parts: string[] = [];
    if (a.summary) parts.push(a.summary);
    for (const p of a.body ?? []) parts.push(p);

    docs.push({
      id: `insight:${a.id}`,
      kind: "insight",
      title: a.title,
      text: parts.join("\n"),
      keywords: extractKeywords(a.title, parts.join(" ")),
      url: `${content.url.replace(/\/+$/, "")}/insights/${a.id}`,
    });
  }

  // FAQ 文档 —— 每个问答一条（问答是独立可引用单元）
  const faqs: FaqItem[] = [
    ...(content.faq ?? []),
    ...content.sections.flatMap((s) => s.faq ?? []),
  ];
  for (const f of faqs) {
    docs.push({
      id: `faq:${f.question.slice(0, 24)}`,
      kind: "faq",
      title: f.question,
      text: `问：${f.question}\n答：${f.answer}`,
      keywords: extractKeywords(f.question, `${f.question} ${f.answer}`),
    });
  }

  // 组织实体文档 —— 回答「你们公司多大/成立多久/做什么」
  const org = content.organization;
  const orgParts: string[] = [];
  if (org.legalName) orgParts.push(`企业全称：${org.legalName}`);
  if (org.description) orgParts.push(org.description);
  if (org.industry) orgParts.push(`所属行业：${org.industry}`);
  if (org.foundingDate) orgParts.push(`成立时间：${org.foundingDate}`);
  if (org.numberOfEmployees) orgParts.push(`员工规模：${org.numberOfEmployees}`);
  if (org.address) {
    orgParts.push(
      `地址：${org.address.addressLocality}${org.address.addressRegion ?? ""}${org.address.streetAddress ?? ""}`,
    );
  }
  if (org.contactPoint?.telephone) orgParts.push(`电话：${org.contactPoint.telephone}`);
  if (org.contactPoint?.email) orgParts.push(`邮箱：${org.contactPoint.email}`);

  const orgText = orgParts.join(" ");

  docs.push({
    id: "organization:self",
    kind: "organization",
    title: org.name,
    text: orgParts.join("\n"),
    keywords: [
      ...extractKeywords(org.name, orgText),
      // 实体同义词 —— 访客的用词与字段名往往不同。
      // 「你们公司多少人」不该因为字段叫「员工规模」就检索不到。
      ...ENTITY_SYNONYMS.flatMap((s) => extractKeywords("", s)),
    ],
    url: content.url,
  });

  return docs;
}

/**
 * 实体字段的同义词表。
 *
 * 访客问「你们公司多少人 / 团队多大 / 几个员工」，
 * 字段名却叫「员工规模」—— 纯字面匹配会漏。
 * 同义词把「问法」映射到「字段」，是关键词检索能用的最小语义层。
 */
const ENTITY_SYNONYMS = [
  "人数 员工 员工规模 团队规模 几个人 多少人 职工 员工总数",
  "成立 成立时间 创立 什么时候成立 成立多久 年份 成立年份",
  "地址 办公地址 公司地址 在哪里 位于 地点",
  "电话 联系电话 客服电话 联系方式 热线",
  "邮箱 邮件 邮箱地址 email 联系邮箱",
  "行业 所属行业 领域 做什么 主营业务",
];

/**
 * 停用二元组 —— 疑问词与泛化词。
 *
 * 中文二元组分词会产生大量无区分度的词：
 *   「你们公司多少人」→ 二元组「多少」「少人」
 * 「多少」在几乎任何 FAQ 里都出现（「起订量多少」「交期多少」），
 * 参与打分会让不相关的文档虚高命中。
 *
 * 这些词不携带实体信息，剔除后打分才准。
 */
const STOP_BIGRAMS = new Set([
  "多少", "几个", "什么", "怎么", "如何", "为何", "为什", "什么",
  "可以", "能够", "是否", "有无", "哪些", "哪里", "多久", "多大",
  "你们", "我们", "他们", "这个", "那个", "一个", "以及", "或者",
  "请问", "咨询", "介绍", "一下", "关于", "对于", "的话", "的话",
]);

/**
 * 关键词抽取。
 *
 * 中文没有空格分词，所以用「二元组 + 英文词 + 数字」的组合：
 *   - 中文二元组（连续两个汉字）能捕捉「数据点」「采集」这类实词
 *   - 英文与数字保留原样（型号 48000 是高价值检索词）
 */
export function extractKeywords(title: string, text: string): string[] {
  const keywords = new Set<string>();

  // 英文词与数字（长度 ≥2 的英文，或任意数字串）
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9._-]{1,}|\d[\d.,%]*\d?/g)) {
    const w = m[0].toLowerCase();
    if (w.length >= 2) keywords.add(w);
  }

  // 中文二元组
  for (const m of text.matchAll(/[一-龥]{2,}/g)) {
    const run = m[0];
    for (let i = 0; i < run.length - 1; i++) {
      const bg = run.slice(i, i + 2);
      if (!STOP_BIGRAMS.has(bg)) keywords.add(bg);
    }
  }

  // 标题整词
  for (const m of title.matchAll(/[A-Za-z][A-Za-z0-9._-]{1,}/g)) {
    keywords.add(m[0].toLowerCase());
  }

  return [...keywords];
}

/**
 * 检索。
 *
 * 打分规则：
 *   - 标题命中权重最高（3 分/词）
 *   - 正文命中 1 分/词
 *   - 命中词数越多分越高
 *   - 长度归一 —— 避免长文档因词多而虚高
 */
export function retrieve(
  docs: KnowledgeDoc[],
  query: string,
  options: RetrievalOptions = {},
): RetrievalHit[] {
  const topK = options.topK ?? 3;
  const minScore = options.minScore ?? 1;

  const queryTerms = extractKeywords(query, query);
  if (queryTerms.length === 0) return [];

  const hits: RetrievalHit[] = [];

  for (const doc of docs) {
    const titleTerms = new Set(extractKeywords(doc.title, doc.title));
    const bodyTerms = new Set(doc.keywords);
    const matched: string[] = [];
    let score = 0;

    for (const term of queryTerms) {
      if (titleTerms.has(term)) {
        score += 3;
        matched.push(term);
      } else if (bodyTerms.has(term)) {
        score += 1;
        matched.push(term);
      }
    }

    if (score <= 0) continue;

    // 长度归一：文档越长，边际命中越不重要
    const normalized = score / Math.sqrt(Math.max(1, doc.text.length / 200));

    hits.push({ doc, score: normalized, matched });
  }

  return hits
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * 构造 RAG 提示 —— 把检索到的文档交给 LLM 作答。
 *
 * 三条硬约束：
 *   1. 只用给定文档回答，不许补充外部知识
 *   2. 不知道就说不知道（这比编造更可信，也更安全）
 *   3. 引用来源 URL（AI 引用需要溯源）
 */
export function buildChatPrompt(
  question: string,
  hits: RetrievalHit[],
  content: SiteContent,
): string {
  const context = hits
    .map((h, i) => {
      const src = h.doc.url ? `（来源：${h.doc.url}）` : "";
      return `[${i + 1}] ${h.doc.title}${src}\n${h.doc.text}`;
    })
    .join("\n\n");

  return `你是${content.organization.name}的官网客服助手。请依据下面的资料回答访客问题。

严格遵守：
1. 只用给定资料回答，不要补充资料之外的信息
2. 资料里没有的，直接说「这个我们不太确定，请联系我们确认」，不要猜测
3. 回答要具体 —— 有数字就用数字，有参数就报参数
4. 回答末尾用 [1] [2] 标注引用了哪几条资料

访客问题：${question}

资料：
${context}`;
}

/**
 * 检索 + 生成的完整链路。
 *
 * 注意：**推理端在服务端**，本函数只产出提示词。
 * 前端拿到的是后端返回的答案，本模块不接触 API Key。
 */
export async function answerQuestion(
  question: string,
  content: SiteContent,
  llm: {
    call: (prompt: string) => Promise<string>;
  },
  options: RetrievalOptions = {},
): Promise<{ answer: string; hits: RetrievalHit[]; hasEvidence: boolean }> {
  const docs = buildKnowledgeBase(content);
  const hits = retrieve(docs, question, options);

  if (hits.length === 0) {
    return {
      answer: "这个问题我暂时答不上来。您可以留下联系方式，我们会安排工程师与您沟通。",
      hits: [],
      hasEvidence: false,
    };
  }

  const prompt = buildChatPrompt(question, hits, content);
  const answer = await llm.call(prompt);

  return { answer, hits, hasEvidence: true };
}

/**
 * 把知识库导出为静态 JSON —— 供纯静态站的外部 API 加载。
 *
 * 这样「知识库」不需要任何服务器：构建时生成 JSON，
 * 推理服务启动时加载它即可。
 */
export function exportKnowledgeBase(content: SiteContent): string {
  const docs = buildKnowledgeBase(content);
  return JSON.stringify(
    {
      siteId: content.siteId,
      siteName: content.name,
      org: {
        name: content.organization.name,
        description: content.organization.description,
        contact: content.contact,
      },
      docs: docs.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        text: d.text,
        url: d.url,
      })),
    },
    null,
    2,
  );
}
