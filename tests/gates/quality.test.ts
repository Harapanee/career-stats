import { describe, it, expect } from "vitest";
import { qualityGate, REQUIRED_DERIVED_TERMS } from "../../src/gates/quality.js";
import type { BuiltPage } from "../../src/render/types.js";

const site = { maxPages: 300, baseUrl: "https://example.test/career-stats", contactEmail: "info@example.test" };
const footer = `<footer><p>本サイトは自動生成・自動更新しています</p><p>窓口: ${site.contactEmail}</p></footer>`;
function head(path: string) {
  return `<head><title>T</title><meta name="description" content="d"><link rel="canonical" href="${site.baseUrl}${path}"></head>`;
}
const derived = `<p>前月比 +0.1、前年同月比 +0.2、全国 5 位、過去最高</p><svg viewBox="0 0 1 1"></svg>`;
function dataPage(path: string, links = ""): BuiltPage {
  return { path, lastmod: "2026-09-01", hasAffiliate: false, isDataPage: true, html: `<html>${head(path)}<body><main>${derived}${links}</main>${footer}</body></html>` };
}
function staticPage(path: string, body = ""): BuiltPage {
  return { path, lastmod: "2026-09-01", hasAffiliate: false, isDataPage: false, html: `<html>${head(path)}<body><main>${body}</main>${footer}</body></html>` };
}

describe("G5 qualityGate", () => {
  it("exports derived terms", () => {
    expect(REQUIRED_DERIVED_TERMS).toEqual(["前月", "前年同月", "全国"]);
  });

  it("PASS: valid site with resolvable internal links, sitemap/robots/anchor accepted", async () => {
    const pages = [
      staticPage("/", `<a href="${site.baseUrl}/pref/tokyo/">tokyo</a><a href="/sitemap.xml">s</a><a href="${site.baseUrl}/robots.txt">r</a><a href="#top">t</a><a href="https://other.test/">ext</a><a href="mailto:x@y">m</a>`),
      dataPage("/pref/tokyo/", `<a href="/">home</a><a href="/pref/tokyo/#chart">c</a>`),
      staticPage("/404.html"),
    ];
    const g = qualityGate(pages, site);
    expect(g.id).toBe("G5");
    expect(g.name).toBe("品質");
    const r = await g.run();
    expect(r.messages).toEqual([]);
    expect(r.status).toBe("PASS");
  });

  it("FAIL: zero pages / more than maxPages", async () => {
    expect((await qualityGate([], site).run()).status).toBe("FAIL");
    const pages = [staticPage("/"), staticPage("/a/"), staticPage("/b/")];
    const r = await qualityGate(pages, { ...site, maxPages: 2 }).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toMatch(/3.*2/);
  });

  it("FAIL: duplicate path", async () => {
    const r = await qualityGate([staticPage("/"), staticPage("/")], site).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toMatch(/重複/);
  });

  it("FAIL: missing title/description/wrong canonical", async () => {
    const p: BuiltPage = { path: "/x/", lastmod: "2026-09-01", hasAffiliate: false, isDataPage: false, html: `<html><head><link rel="canonical" href="${site.baseUrl}/y/"></head><body>${footer}</body></html>` };
    const r = await qualityGate([p], site).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toContain("title");
    expect(msg).toContain("description");
    expect(msg).toMatch(/canonical.*\/y\//);
  });

  it("FAIL: broken internal link names page and href", async () => {
    const r = await qualityGate([staticPage("/", `<a href="${site.baseUrl}/pref/nowhere/">x</a>`)], site).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toMatch(/\/.*\/pref\/nowhere\//);
  });

  it("FAIL: data page lacks derived values or svg", async () => {
    const p: BuiltPage = { ...dataPage("/pref/osaka/"), html: `<html>${head("/pref/osaka/")}<body><main><p>前月比のみ</p></main>${footer}</body></html>` };
    const r = await qualityGate([p], site).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toContain("前年同月");
    expect(msg).toContain("全国");
    expect(msg).toContain("過去最高");
    expect(msg).toContain("svg");
  });

  it("FAIL: missing 自動生成 disclosure or contact email", async () => {
    const p: BuiltPage = { path: "/", lastmod: "2026-09-01", hasAffiliate: false, isDataPage: false, html: `<html>${head("/")}<body><main></main></body></html>` };
    const r = await qualityGate([p], site).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toContain("自動生成");
    expect(msg).toContain(site.contactEmail);
  });
});
