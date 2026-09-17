import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { containsAffiliate, loadMonetization, renderCta, selectPrograms } from "../../src/monetize/cta.js";
import type { Monetization, Program } from "../../src/monetize/types.js";

const PROHIBITED = [
  "No.1", "1位のエージェント", "おすすめ度", "満足度", "必ず", "絶対", "業界最高", "報酬",
  "成果条件", "確定率", "応募する", "求人詳細", "求人番号", "募集中", "採用情報",
];
const URL = "https://px.a8.net/svt/ejp?a8mat=ABC+XYZ&x=1";

const prog = (over: Partial<Program> = {}): Program => ({
  id: "p1",
  name: "テスト<エージェント>",
  advertiser: "株式会社\"テスト\" & Co.",
  asp: "A8.net",
  aspProgramId: "s0000",
  status: "active",
  url: URL,
  targetAudience: "新卒",
  targetRegions: [],
  contexts: ["new-graduate"],
  cta: "相談する(無料)",
  ...over,
});
const mon = (programs: Program[]): Monetization => ({
  disclosure: "本ページにはプロモーションが含まれています。",
  programs,
  paidData: { status: "pending", stripePaymentLinkUrl: "" },
});

describe("selectPrograms", () => {
  it("excludes pending / retired and non-matching contexts", () => {
    const m = mon([prog({ id: "a", status: "pending" }), prog({ id: "b", status: "retired" }), prog({ id: "c", contexts: ["pharmacist"] }), prog({ id: "d" })]);
    expect(selectPrograms(m, { context: "new-graduate" }).map((p) => p.id)).toEqual(["d"]);
  });

  it("filters by region and keeps config order", () => {
    const m = mon([prog({ id: "tokyo", targetRegions: ["13", "27"] }), prog({ id: "all" })]);
    expect(selectPrograms(m, { context: "new-graduate", region: "13" }).map((p) => p.id)).toEqual(["tokyo", "all"]);
    expect(selectPrograms(m, { context: "new-graduate", region: "01" }).map((p) => p.id)).toEqual(["all"]);
    expect(selectPrograms(m, { context: "new-graduate" }).map((p) => p.id)).toEqual(["all"]);
  });
});

describe("renderCta", () => {
  it("returns empty string for no programs", () => {
    expect(renderCta([])).toBe("");
  });

  it("renders aside with PR label, rel/target attributes and escaped text", () => {
    const html = renderCta([prog()]);
    expect(html.startsWith('<aside class="cta" aria-label="広告">')).toBe(true);
    expect(html).toContain("<h2>関連サービス(広告)</h2>");
    expect(html).toContain('<span class="pr-label">PR</span>');
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("テスト&lt;エージェント&gt;(広告主: 株式会社&quot;テスト&quot; &amp; Co.)");
    expect(html).toContain("<p>新卒 向け</p>");
    expect(html).toContain('class="cta-note"');
    expect(html).not.toContain("<エージェント>");
    expect(renderCta([prog()], { heading: "PR枠" })).toContain("<h2>PR枠</h2>");
  });

  it("keeps the URL unmodified (attribute-escaped only)", () => {
    const html = renderCta([prog()]);
    const m = /href="([^"]*)"/.exec(html);
    expect(m?.[1]).toBe(URL.replace(/&/g, "&amp;"));
    expect(m?.[1]?.replace(/&amp;/g, "&")).toBe(URL);
  });

  it("never emits prohibited words", () => {
    const html = renderCta([prog(), prog({ id: "p2", targetAudience: "薬剤師" })]);
    for (const w of PROHIBITED) expect(html, `prohibited: ${w}`).not.toContain(w);
  });
});

describe("containsAffiliate", () => {
  it("detects any program url in html", () => {
    const m = mon([prog({ url: "" }), prog({ id: "p2", url: "https://example.com/aff?x=1" })]);
    expect(containsAffiliate("<a href=\"https://example.com/aff?x=1\">x</a>", m)).toBe(true);
    expect(containsAffiliate("<p>plain</p>", m)).toBe(false);
    expect(containsAffiliate("", mon([prog({ url: "" })]))).toBe(false);
  });
});

describe("loadMonetization", () => {
  it("reads config/monetization.json (all pending → nothing selected)", async () => {
    const m = await loadMonetization("config/monetization.json");
    expect(m.programs.length).toBeGreaterThan(0);
    expect(m.disclosure.length).toBeGreaterThan(0);
    for (const ctx of ["new-graduate", "pharmacist"]) expect(selectPrograms(m, { context: ctx, region: "13" })).toEqual([]);
  });

  it("throws for an active program without https url", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cta-"));
    const bad = join(dir, "bad.json");
    await writeFile(bad, JSON.stringify(mon([prog({ url: "" })])), "utf8");
    await expect(loadMonetization(bad)).rejects.toThrow(/url/i);
    const http = join(dir, "http.json");
    await writeFile(http, JSON.stringify(mon([prog({ url: "http://example.com" })])), "utf8");
    await expect(loadMonetization(http)).rejects.toThrow(/url/i);
    const status = join(dir, "status.json");
    await writeFile(status, JSON.stringify(mon([prog({ status: "bogus" as Program["status"] })])), "utf8");
    await expect(loadMonetization(status)).rejects.toThrow(/status/i);
  });
});
