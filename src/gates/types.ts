/** ゲート群の共有型。sources/normalize には依存しない(並行開発のため)。 */
export type { Gate, GateResult, GateStatus } from "./run.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** HTML 中の <a> 要素 1 件。href は &amp; を & に戻した値 */
export interface Anchor {
  href: string;
  rel: string;
  /** 元の開始タグ文字列 */
  tag: string;
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** ページ内の <a ...> をすべて抽出する(属性値は " または ' で囲まれている前提) */
export function extractAnchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(/<a\s[^>]*>/gi)) {
    const tag = m[0];
    const attrs: Record<string, string> = {};
    for (const a of tag.matchAll(ATTR_RE)) attrs[a[1]!.toLowerCase()] = a[2] ?? a[3] ?? "";
    out.push({ href: unescapeHtml(attrs["href"] ?? ""), rel: attrs["rel"] ?? "", tag });
  }
  return out;
}

/** script/style ごと除去し、タグを剥がした本文テキストを返す(属性値は含まれない) */
export function stripTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "");
}

export function result(messages: string[], warn = false): { status: "PASS" | "WARN" | "FAIL"; messages: string[] } {
  if (messages.length === 0) return { status: "PASS", messages: [] };
  return { status: warn ? "WARN" : "FAIL", messages };
}
