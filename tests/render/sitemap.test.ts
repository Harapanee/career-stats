import { describe, it, expect } from "vitest";
import { renderSitemap, renderRobots } from "../../src/render/sitemap.js";

describe("renderSitemap", () => {
  it("lists absolute URLs with lastmod and escapes ampersands", () => {
    const xml = renderSitemap("https://example.com/base", [
      { path: "/", lastmod: "2026-09-18" },
      { path: "/pref/tokyo/", lastmod: "2026-09-18" },
      { path: "/a&b/", lastmod: "2026-09-01" },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<loc>https://example.com/base/</loc>");
    expect(xml).toContain("<loc>https://example.com/base/pref/tokyo/</loc>");
    expect(xml).toContain("<loc>https://example.com/base/a&amp;b/</loc>");
    expect(xml).toContain("<lastmod>2026-09-01</lastmod>");
    expect((xml.match(/<url>/g) ?? []).length).toBe(3);
  });
  it("does not double slashes when base ends with /", () => {
    const xml = renderSitemap("https://example.com/base/", [{ path: "/x/", lastmod: "2026-01-01" }]);
    expect(xml).toContain("<loc>https://example.com/base/x/</loc>");
  });
});

describe("renderRobots", () => {
  it("allows all and points to the sitemap", () => {
    const txt = renderRobots("https://example.com/base");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://example.com/base/sitemap.xml");
  });
});
