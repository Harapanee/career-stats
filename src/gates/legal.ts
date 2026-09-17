/** G3 法令表記: PR 開示の位置・PR ラベル・出典表記・禁止語彙・sponsored rel を検査する。 */
import type { BuiltPage } from "../render/types.js";
import type { Monetization } from "../monetize/types.js";
import { extractAnchors, result, stripTags, type Gate } from "./types.js";

export { stripTags };

/** 広告文脈の禁止語(L5/L10)と求人票語彙(L1) */
export const PROHIBITED_WORDS: readonly string[] = [
  "No.1",
  "1位のエージェント",
  "おすすめ度",
  "満足度",
  "必ず",
  "絶対",
  "業界最高",
  "報酬",
  "成果条件",
  "確定率",
  "応募する",
  "求人詳細",
  "求人番号",
  "募集中",
  "採用情報",
];

export const A8_HOST_RE = /a8\.net/i;
export const REQUIRED_REL = ["sponsored", "nofollow"] as const;
export const PR_LABEL_CLASS = "pr-label";
export const SOURCE_MARKERS = ["出典", "加工して作成"] as const;

function relTokens(rel: string): Set<string> {
  return new Set(rel.toLowerCase().split(/\s+/).filter(Boolean));
}

function checkDisclosure(page: BuiltPage, disclosure: string, out: string[]): void {
  const html = page.html;
  const mainIdx = html.search(/<main[\s>]/i);
  const articleIdx = html.search(/<article[\s>]/i);
  const discIdx = disclosure ? html.indexOf(disclosure) : -1;
  if (discIdx < 0) out.push(`${page.path}: PR 開示文「${disclosure}」がない`);
  else if (mainIdx < 0 || discIdx < mainIdx) out.push(`${page.path}: PR 開示文が <main> の内側にない`);
  else if (articleIdx >= 0 && discIdx > articleIdx) out.push(`${page.path}: PR 開示文が最初の <article> より後にある`);
  if (!html.includes(PR_LABEL_CLASS)) out.push(`${page.path}: CTA の PR ラベル(class="${PR_LABEL_CLASS}")がない`);
}

function checkAnchors(page: BuiltPage, activeUrls: string[], out: string[]): void {
  for (const a of extractAnchors(page.html)) {
    const isAffiliate = A8_HOST_RE.test(a.href) || activeUrls.some((u) => a.href.includes(u));
    if (!isAffiliate) continue;
    const rel = relTokens(a.rel);
    const missing = REQUIRED_REL.filter((t) => !rel.has(t));
    if (missing.length > 0) out.push(`${page.path}: アフィリエイトリンク ${a.href} の rel に ${missing.join("/")} がない(rel="${a.rel}")`);
  }
}

function checkProhibited(page: BuiltPage, out: string[]): void {
  const text = stripTags(page.html);
  for (const w of PROHIBITED_WORDS) if (text.includes(w)) out.push(`${page.path}: 禁止語「${w}」を含む`);
}

export function legalTextGate(pages: BuiltPage[], m: Monetization): Gate {
  const activeUrls = m.programs.filter((p) => p.status === "active").map((p) => p.url);
  return {
    id: "G3",
    name: "法令表記",
    run: () => {
      const out: string[] = [];
      for (const page of pages) {
        if (page.hasAffiliate) checkDisclosure(page, m.disclosure, out);
        checkAnchors(page, activeUrls, out);
        if (page.isDataPage)
          for (const marker of SOURCE_MARKERS) if (!page.html.includes(marker)) out.push(`${page.path}: 出典表記「${marker}」がない`);
        checkProhibited(page, out);
      }
      return result(out);
    },
  };
}
