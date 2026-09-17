import { escapeXml } from "./svg.js";

export interface SitemapEntry {
  /** サイトルートからの絶対パス。"/" で始まる */
  path: string;
  /** YYYY-MM-DD */
  lastmod: string;
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

export function renderSitemap(baseUrl: string, entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => `  <url><loc>${escapeXml(joinUrl(baseUrl, e.path))}</loc><lastmod>${e.lastmod}</lastmod></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${joinUrl(baseUrl, "sitemap.xml")}\n`;
}
