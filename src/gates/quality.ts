/** G5 品質: ページ数・メタ情報・内部リンク・派生値・自動生成の開示・窓口を検査する。 */
import type { BuiltPage } from "../render/types.js";
import { extractAnchors, result, type Gate } from "./types.js";

export interface QualitySiteParams {
  maxPages: number;
  baseUrl: string;
  contactEmail: string;
}

/** データページに必須の派生値の語(これに加えて「過去最高」または「過去最低」) */
export const REQUIRED_DERIVED_TERMS: readonly string[] = ["前月", "前年同月", "全国"];
export const EXTREME_TERMS: readonly string[] = ["過去最高", "過去最低"];
export const AUTO_GENERATED_MARKER = "自動生成";
/** ページ集合になくても許容するパス */
export const ALLOWED_NON_PAGE_PATHS: readonly string[] = ["/sitemap.xml", "/robots.txt"];

function canonicalOf(html: string): string | undefined {
  const tag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0];
  return tag?.match(/href=["']([^"']*)["']/i)?.[1];
}

/** 内部リンクの href を "/x/" 形式に正規化。外部・mailto・アンカーのみは undefined */
export function internalPath(href: string, base: string): string | undefined {
  let p: string;
  if (href.startsWith(base)) p = href.slice(base.length) || "/";
  else if (href.startsWith("/")) p = href;
  else return undefined;
  p = p.replace(/[#?].*$/, "");
  return p === "" ? "/" : p;
}

function checkPage(page: BuiltPage, site: QualitySiteParams, base: string, paths: Set<string>, out: string[]): void {
  const { html, path } = page;
  if (!/<title>[^<]+<\/title>/i.test(html)) out.push(`${path}: <title> がない`);
  if (!/<meta\s[^>]*name=["']description["']/i.test(html)) out.push(`${path}: <meta name="description"> がない`);
  const expected = base + path;
  const canonical = canonicalOf(html);
  if (canonical !== expected) out.push(`${path}: canonical が ${canonical ?? "未設定"}(期待 ${expected})`);
  for (const a of extractAnchors(html)) {
    const p = internalPath(a.href, base);
    if (p === undefined) continue;
    if (paths.has(p) || paths.has(p + "/") || ALLOWED_NON_PAGE_PATHS.includes(p)) continue;
    out.push(`${path}: 内部リンク切れ ${a.href}`);
  }
  if (page.isDataPage) {
    for (const t of REQUIRED_DERIVED_TERMS) if (!html.includes(t)) out.push(`${path}: 派生値「${t}」がない`);
    if (!EXTREME_TERMS.some((t) => html.includes(t))) out.push(`${path}: 派生値「${EXTREME_TERMS.join("/")}」がない`);
    if (!/<svg[\s>]/i.test(html)) out.push(`${path}: 図表(<svg>)がない`);
  }
  if (!html.includes(AUTO_GENERATED_MARKER)) out.push(`${path}: 「${AUTO_GENERATED_MARKER}」の開示がない`);
  if (!html.includes(site.contactEmail)) out.push(`${path}: 窓口 ${site.contactEmail} がない`);
}

export function qualityGate(pages: BuiltPage[], site: QualitySiteParams): Gate {
  return {
    id: "G5",
    name: "品質",
    run: () => {
      const out: string[] = [];
      if (pages.length === 0) return result(["ページが 0 件"]);
      if (pages.length > site.maxPages) out.push(`ページ数 ${pages.length} が上限 ${site.maxPages} を超過`);
      const paths = new Set<string>();
      for (const p of pages) {
        if (paths.has(p.path)) out.push(`${p.path}: パスが重複`);
        paths.add(p.path);
      }
      const base = site.baseUrl.replace(/\/+$/, "");
      for (const page of pages) checkPage(page, site, base, paths, out);
      return result(out);
    },
  };
}
