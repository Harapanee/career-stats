/**
 * ページ全体(HTML5文書)のレンダラ。純粋関数・決定的出力・外部アセットなし。
 */
import { escapeXml } from "./svg.js";
import { joinUrl } from "./sitemap.js";

export interface SiteConfig {
  name: string;
  tagline: string;
  baseUrl: string;
  operator: { name: string; contactEmail: string };
  locale: string;
  maxPages: number;
  searchConsoleVerification: string;
  adsense: { publisherId: string };
}

export interface SourceRef {
  name: string;
  url: string;
  termsUrl: string;
}

export interface PageSpec {
  /** ページタイトル。サイト名が "<title> | <site.name>" の形で付加される */
  title: string;
  description: string;
  /** "/pref/tokyo/" のようなディレクトリ形式(末尾スラッシュ)またはルート "/" */
  path: string;
  /** レンダリング済み記事HTML(信頼済み・エスケープしない) */
  bodyHtml: string;
  /** true のとき <main> 内・<article> の前に開示バナーを必ず出す */
  hasAffiliate: boolean;
  disclosure: string;
  /** フッターの出典一覧。静的ページでは空 */
  sources: SourceRef[];
  /** 先頭にホームを含む */
  breadcrumbs: { name: string; path: string }[];
  /** YYYY-MM-DD */
  updatedAt: string;
  noindex?: boolean;
}

const NAV_LINKS: { path: string; label: string }[] = [
  { path: "/", label: "トップ" },
  { path: "/metrics/", label: "指標一覧" },
  { path: "/pref/", label: "都道府県" },
  { path: "/about/", label: "このサイトについて" },
];

const STYLE = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif;font-size:16px;line-height:1.7;color:#222;background:#fff}
a{color:#0b5cad}
header,main,footer{max-width:960px;margin:0 auto;padding:0 16px}
header{padding-top:16px;padding-bottom:8px;border-bottom:1px solid #ddd}
header .site{margin:0;font-size:1.25rem;font-weight:700}
header .site a{text-decoration:none;color:#222}
header .tagline{margin:2px 0 8px;color:#666;font-size:.9rem}
nav.global ul,nav[aria-label="パンくず"] ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 16px}
nav[aria-label="パンくず"]{font-size:.85rem;color:#666;margin:12px 0}
nav[aria-label="パンくず"] li+li::before{content:"›";margin-right:8px;color:#999}
main{padding-top:8px;padding-bottom:32px}
article h1{font-size:1.6rem;line-height:1.35;margin:8px 0}
.updated{color:#666;font-size:.85rem;margin:0 0 16px}
.disclosure{background:#fff7e0;border:1px solid #e6c56b;border-radius:6px;padding:8px 12px;font-size:.85rem;color:#5a4400;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:.95rem;margin:12px 0}
th,td{border:1px solid #ddd;padding:6px 8px;text-align:right}
th:first-child,td:first-child{text-align:left}
thead th{background:#f3f5f8}
.table-wrap{overflow-x:auto}
svg{width:100%;height:auto;display:block;margin:12px 0}
.highlight{fill:#d62728}
footer{border-top:1px solid #ddd;padding-top:16px;padding-bottom:32px;font-size:.85rem;color:#555}
footer ul{padding-left:1.2em}
footer nav a{margin-right:12px}
@media (min-width:768px){body{font-size:17px}article h1{font-size:2rem}}
`.trim();

function link(site: SiteConfig, path: string, label: string): string {
  return `<a href="${escapeXml(joinUrl(site.baseUrl, path))}">${escapeXml(label)}</a>`;
}

function renderHead(site: SiteConfig, page: PageSpec): string {
  const parts = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeXml(page.title)} | ${escapeXml(site.name)}</title>`,
    `<meta name="description" content="${escapeXml(page.description)}">`,
    `<link rel="canonical" href="${escapeXml(joinUrl(site.baseUrl, page.path))}">`,
  ];
  if (page.noindex) parts.push('<meta name="robots" content="noindex">');
  if (site.searchConsoleVerification)
    parts.push(`<meta name="google-site-verification" content="${escapeXml(site.searchConsoleVerification)}">`);
  if (site.adsense.publisherId)
    parts.push(
      `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeXml(site.adsense.publisherId)}" crossorigin="anonymous"></script>`,
    );
  parts.push(`<style>${STYLE}</style>`);
  return parts.join("\n");
}

function renderBreadcrumbs(site: SiteConfig, page: PageSpec): string {
  const items = page.breadcrumbs.map((b) => `<li>${link(site, b.path, b.name)}</li>`).join("");
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: page.breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.name,
      item: joinUrl(site.baseUrl, b.path),
    })),
  };
  // JSON-LD 内で "</script>" が成立しないよう "<" をエスケープ
  const json = JSON.stringify(ld).replace(/</g, "\\u003c");
  return `<nav aria-label="パンくず"><ol>${items}</ol></nav>\n<script type="application/ld+json">${json}</script>`;
}

function renderSources(sources: SourceRef[]): string {
  if (sources.length === 0) return "";
  const items = sources
    .map(
      (s) =>
        `<li><a href="${escapeXml(s.url)}" rel="noopener">${escapeXml(s.name)}</a>` +
        `(<a href="${escapeXml(s.termsUrl)}" rel="noopener">利用規約</a>)</li>`,
    )
    .join("");
  return `<section class="sources"><h2>出典</h2><ul>${items}</ul><p>上記の公的統計を加工して作成しています。</p></section>\n`;
}

export function renderPage(site: SiteConfig, page: PageSpec): string {
  const year = page.updatedAt.slice(0, 4);
  const nav = NAV_LINKS.map((n) => `<li>${link(site, n.path, n.label)}</li>`).join("");
  const disclosure = page.hasAffiliate ? `<p class="disclosure">${escapeXml(page.disclosure)}</p>\n` : "";
  return [
    "<!DOCTYPE html>",
    '<html lang="ja">',
    "<head>",
    renderHead(site, page),
    "</head>",
    "<body>",
    "<header>",
    `<p class="site">${link(site, "/", site.name)}</p>`,
    `<p class="tagline">${escapeXml(site.tagline)}</p>`,
    `<nav class="global" aria-label="グローバルナビゲーション"><ul>${nav}</ul></nav>`,
    "</header>",
    "<main>",
    renderBreadcrumbs(site, page),
    disclosure + "<article>",
    `<h1>${escapeXml(page.title)}</h1>`,
    `<p class="updated">最終更新: ${escapeXml(page.updatedAt)}</p>`,
    page.bodyHtml,
    "</article>",
    "</main>",
    "<footer>",
    renderSources(page.sources) +
      `<nav aria-label="サイト情報">${link(site, "/about/", "このサイトについて")}${link(site, "/privacy/", "プライバシーポリシー")}${link(site, "/ads-policy/", "広告ポリシー")}</nav>`,
    `<p>運営: ${escapeXml(site.operator.name)} / © ${escapeXml(year)} ${escapeXml(site.name)}</p>`,
    "</footer>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
