import { describe, it, expect } from "vitest";
import { renderPage, type SiteConfig, type PageSpec } from "../../src/render/page.js";

const site: SiteConfig = {
  name: "就活・転職データラボ",
  tagline: "公的統計でみる就職・転職の今",
  baseUrl: "https://example.github.io/career-stats",
  operator: { name: "harateck", contactEmail: "k@example.com" },
  locale: "ja",
  maxPages: 300,
  searchConsoleVerification: "",
  adsense: { publisherId: "" },
};

const page: PageSpec = {
  title: "東京都の有効求人倍率",
  description: "東京都の有効求人倍率の推移",
  path: "/pref/tokyo/",
  bodyHtml: "<section><h2>推移</h2><svg><rect class=\"highlight\"/></svg></section>",
  hasAffiliate: false,
  disclosure: "本ページにはプロモーション(アフィリエイト広告)が含まれています。",
  sources: [
    { name: "厚生労働省 一般職業紹介状況", url: "https://www.mhlw.go.jp/x", termsUrl: "https://www.mhlw.go.jp/terms" },
  ],
  breadcrumbs: [
    { name: "トップ", path: "/" },
    { name: "都道府県", path: "/pref/" },
    { name: "東京都", path: "/pref/tokyo/" },
  ],
  updatedAt: "2026-09-18",
};

describe("renderPage: document skeleton", () => {
  const html = renderPage(site, page);
  it("is an HTML5 ja document with charset, viewport, title and description", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("<title>東京都の有効求人倍率 | 就活・転職データラボ</title>");
    expect(html).toContain('<meta name="description" content="東京都の有効求人倍率の推移">');
  });
  it("joins canonical URL from baseUrl and path", () => {
    expect(html).toContain('<link rel="canonical" href="https://example.github.io/career-stats/pref/tokyo/">');
  });
  it("has inline style only and no external assets", () => {
    expect(html).toContain("<style>");
    expect(html).toContain(".disclosure");
    expect(html).toContain(".highlight");
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
  it("renders header with site name link and absolute nav links under sub-path", () => {
    expect(html).toContain('<a href="https://example.github.io/career-stats/">就活・転職データラボ</a>');
    expect(html).toContain("公的統計でみる就職・転職の今");
    expect(html).toContain('<a href="https://example.github.io/career-stats/metrics/">指標一覧</a>');
    expect(html).toContain('<a href="https://example.github.io/career-stats/pref/">都道府県</a>');
    expect(html).toContain('<a href="https://example.github.io/career-stats/about/">このサイトについて</a>');
    expect(html).not.toMatch(/href="\/[^"]*"/);
  });
  it("renders article with h1, updated date and trusted bodyHtml", () => {
    expect(html).toContain("<h1>東京都の有効求人倍率</h1>");
    expect(html).toContain('<p class="updated">最終更新: 2026-09-18</p>');
    expect(html).toContain(page.bodyHtml);
  });
  it("uses year from updatedAt for copyright", () => {
    expect(html).toContain("© 2026");
    expect(html).toContain("運営: harateck");
  });
});

describe("renderPage: breadcrumbs", () => {
  const html = renderPage(site, page);
  it("renders breadcrumb nav and JSON-LD BreadcrumbList with absolute item URLs", () => {
    expect(html).toContain('<nav aria-label="パンくず">');
    expect(html).toContain('<script type="application/ld+json">');
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const ld = JSON.parse(m![1]!) as { "@type": string; itemListElement: { position: number; item: string }[] };
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement[0]!.item).toBe("https://example.github.io/career-stats/");
    expect(ld.itemListElement[2]!.item).toBe("https://example.github.io/career-stats/pref/tokyo/");
    expect(ld.itemListElement[2]!.position).toBe(3);
  });
});

describe("renderPage: disclosure", () => {
  it("is absent when hasAffiliate is false", () => {
    expect(renderPage(site, page)).not.toContain('class="disclosure"');
  });
  it("appears inside <main> before <article> when hasAffiliate is true", () => {
    const html = renderPage(site, { ...page, hasAffiliate: true });
    const main = html.indexOf("<main>");
    const disc = html.indexOf('<p class="disclosure">');
    const article = html.indexOf("<article>");
    expect(main).toBeGreaterThan(-1);
    expect(disc).toBeGreaterThan(main);
    expect(article).toBeGreaterThan(disc);
    expect(html).toContain("本ページにはプロモーション(アフィリエイト広告)が含まれています。");
  });
});

describe("renderPage: conditional head tags", () => {
  it("omits search-console and adsense when empty", () => {
    const html = renderPage(site, page);
    expect(html).not.toContain("google-site-verification");
    expect(html).not.toContain("adsbygoogle");
  });
  it("emits search-console meta and adsense script when configured", () => {
    const html = renderPage(
      { ...site, searchConsoleVerification: "abc123", adsense: { publisherId: "ca-pub-999" } },
      page,
    );
    expect(html).toContain('<meta name="google-site-verification" content="abc123">');
    expect(html).toContain(
      '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-999" crossorigin="anonymous"></script>',
    );
  });
  it("emits robots noindex only when requested", () => {
    expect(renderPage(site, page)).not.toContain('name="robots"');
    expect(renderPage(site, { ...page, noindex: true })).toContain('<meta name="robots" content="noindex">');
  });
});

describe("renderPage: escaping", () => {
  it("escapes title, description and breadcrumb names", () => {
    const html = renderPage(site, {
      ...page,
      title: 'A<b>&"c"',
      description: 'd<>&"',
      breadcrumbs: [{ name: "トップ", path: "/" }, { name: "x&y", path: "/pref/" }],
    });
    expect(html).toContain("<title>A&lt;b&gt;&amp;&quot;c&quot; | 就活・転職データラボ</title>");
    expect(html).toContain("<h1>A&lt;b&gt;&amp;&quot;c&quot;</h1>");
    expect(html).toContain('content="d&lt;&gt;&amp;&quot;"');
    expect(html).not.toContain("A<b>");
    expect(html).toContain("x&amp;y");
  });
});

describe("renderPage: footer sources", () => {
  it("lists sources with terms link and the 加工 sentence", () => {
    const html = renderPage(site, page);
    expect(html).toContain('<section class="sources">');
    expect(html).toContain("出典");
    expect(html).toContain('<a href="https://www.mhlw.go.jp/x" rel="noopener">厚生労働省 一般職業紹介状況</a>');
    expect(html).toContain('<a href="https://www.mhlw.go.jp/terms" rel="noopener">利用規約</a>');
    expect(html).toContain("上記の公的統計を加工して作成しています。");
    expect(html).toContain('<a href="https://example.github.io/career-stats/privacy/">');
    expect(html).toContain('<a href="https://example.github.io/career-stats/ads-policy/">');
  });
  it("omits the sources section when empty", () => {
    const html = renderPage(site, { ...page, sources: [] });
    expect(html).not.toContain('class="sources"');
    expect(html).not.toContain("加工して作成");
  });
});
