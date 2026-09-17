import { describe, it, expect } from "vitest";
import { legalTextGate, PROHIBITED_WORDS, stripTags } from "../../src/gates/legal.js";
import type { BuiltPage } from "../../src/render/types.js";
import type { Monetization } from "../../src/monetize/types.js";

const A8 = "https://px.a8.net/svt/ejp?a8mat=ACTIVE";
const m: Monetization = {
  disclosure: "本ページにはプロモーション(アフィリエイト広告)が含まれています",
  programs: [
    { id: "p1", name: "A", advertiser: "A社", asp: "a8", aspProgramId: "1", status: "active", url: A8, targetAudience: "", targetRegions: [], contexts: [], cta: "相談する" },
    { id: "p2", name: "B", advertiser: "B社", asp: "a8", aspProgramId: "2", status: "retired", url: "https://px.a8.net/svt/ejp?a8mat=RETIRED", targetAudience: "", targetRegions: [], contexts: [], cta: "x" },
  ],
  paidData: { status: "disabled", stripePaymentLinkUrl: "" },
};

const dataBody = `<h1>東京都の有効求人倍率</h1><p>出典:『一般職業紹介状況』(厚生労働省)を加工して作成(harateck)</p>`;
function page(p: Partial<BuiltPage> & { html: string }): BuiltPage {
  return { path: "/pref/tokyo/", lastmod: "2026-09-01", hasAffiliate: false, isDataPage: false, ...p };
}
const affiliateHtml = (opts?: { disclosureAfter?: boolean; rel?: string; noPr?: boolean }) =>
  `<html><body><header>x</header><main>` +
  (opts?.disclosureAfter ? "" : `<p class="disclosure">${m.disclosure}</p>`) +
  `<article>${dataBody}` +
  (opts?.disclosureAfter ? `<p class="disclosure">${m.disclosure}</p>` : "") +
  `<div class="cta">${opts?.noPr ? "" : '<span class="pr-label">PR</span>'}<a href="${A8}" rel="${opts?.rel ?? "sponsored nofollow noopener"}">相談する</a></div>` +
  `</article></main></body></html>`;

describe("G3 legalTextGate", () => {
  it("exports prohibited words", () => {
    expect(PROHIBITED_WORDS).toContain("No.1");
    expect(PROHIBITED_WORDS).toContain("採用情報");
    expect(PROHIBITED_WORDS).toHaveLength(15);
  });

  it("stripTags removes tags, scripts and styles", () => {
    expect(stripTags(`<p class="必ず">a<script>絶対</script><style>x</style>b</p>`)).toBe("ab");
  });

  it("PASS: affiliate data page with disclosure before article, PR label, sponsored rel", async () => {
    const g = legalTextGate([page({ html: affiliateHtml(), hasAffiliate: true, isDataPage: true })], m);
    expect(g.id).toBe("G3");
    expect(g.name).toBe("法令表記");
    const r = await g.run();
    expect(r.messages).toEqual([]);
    expect(r.status).toBe("PASS");
  });

  it("FAIL: disclosure after <article>", async () => {
    const r = await legalTextGate([page({ html: affiliateHtml({ disclosureAfter: true }), hasAffiliate: true })], m).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toMatch(/\/pref\/tokyo\/.*article/);
  });

  it("FAIL: disclosure missing entirely", async () => {
    const html = `<main><article>${dataBody}<span class="pr-label">PR</span><a href="${A8}" rel="sponsored nofollow">x</a></article></main>`;
    const r = await legalTextGate([page({ html, hasAffiliate: true })], m).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toContain("開示");
  });

  it("FAIL: affiliate link lacks sponsored/nofollow", async () => {
    const r = await legalTextGate([page({ html: affiliateHtml({ rel: "noopener" }), hasAffiliate: true })], m).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toContain("sponsored");
  });

  it("FAIL: any a8.net link must be sponsored even if not in allowlist", async () => {
    const html = `<main><article><a href="https://px.a8.net/svt/ejp?a8mat=UNKNOWN">x</a></article></main>`;
    const r = await legalTextGate([page({ html, path: "/about/" })], m).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toMatch(/\/about\/.*a8\.net.*sponsored/);
  });

  it("FAIL: PR label missing on affiliate page", async () => {
    const r = await legalTextGate([page({ html: affiliateHtml({ noPr: true }), hasAffiliate: true })], m).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toContain("pr-label");
  });

  it("FAIL: data page without 加工して作成 / 出典", async () => {
    const r = await legalTextGate([page({ html: `<main><article><h1>x</h1></article></main>`, isDataPage: true })], m).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toContain("加工して作成");
    expect(r.messages.join("\n")).toContain("出典");
  });

  it("FAIL: prohibited word in text (reports path and word), ignores attribute values", async () => {
    const bad = page({ path: "/agents/", html: `<main><article><p>おすすめ度が高い</p></article></main>` });
    const okAttr = page({ path: "/ok/", html: `<main><article><p data-x="必ず">安全</p></article></main>` });
    const r = await legalTextGate([bad, okAttr], m).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toContain("/agents/");
    expect(r.messages[0]).toContain("おすすめ度");
  });
});
