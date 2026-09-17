import { describe, it, expect } from "vitest";
import { staticPages } from "../../src/render/static-pages.js";

const site = { name: "テスト<サイト>", operator: { name: "harateck", contactEmail: "k@ex.com" } };
const PROHIBITED = ["No.1", "1位のエージェント", "おすすめ度", "満足度", "必ず", "絶対", "業界最高", "報酬", "成果条件", "確定率", "応募する", "求人詳細", "求人番号", "募集中", "採用情報"];

describe("staticPages", () => {
  it("returns about/privacy/ads-policy with escaped site name and contact", () => {
    const pages = staticPages(site);
    expect(pages.map((p) => p.path)).toEqual(["/about/", "/privacy/", "/ads-policy/"]);
    const about = pages[0]!;
    expect(about.bodyHtml).toContain("テスト&lt;サイト&gt;");
    expect(about.bodyHtml).toContain('href="mailto:k@ex.com"');
    expect(about.bodyHtml).toContain("自動生成");
    expect(about.bodyHtml).toContain("API機能を使用していますが");
  });
  it("contains no prohibited words", () => {
    for (const p of staticPages(site)) {
      const text = p.bodyHtml.replace(/<[^>]+>/g, "");
      for (const w of PROHIBITED) expect(text, `${p.path} contains ${w}`).not.toContain(w);
    }
  });
  it("privacy page mentions Google ad cookies", () => {
    const privacy = staticPages(site).find((p) => p.path === "/privacy/")!;
    expect(privacy.bodyHtml).toContain("Cookie");
    expect(privacy.bodyHtml).toContain("Google");
  });
});
