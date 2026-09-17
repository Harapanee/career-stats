import { describe, it, expect } from "vitest";
import { affiliateGate, ASP_URL_RE } from "../../src/gates/affiliate.js";
import type { FetchLike } from "../../src/gates/types.js";
import type { BuiltPage } from "../../src/render/types.js";
import type { Monetization } from "../../src/monetize/types.js";

const ACTIVE = "https://px.a8.net/svt/ejp?a8mat=ACTIVE";
const PENDING = "https://px.a8.net/svt/ejp?a8mat=PENDING";
const m: Monetization = {
  disclosure: "PR",
  programs: [
    { id: "p1", name: "A", advertiser: "", asp: "a8", aspProgramId: "1", status: "active", url: ACTIVE, targetAudience: "", targetRegions: [], contexts: [], cta: "" },
    { id: "p2", name: "B", advertiser: "", asp: "a8", aspProgramId: "2", status: "pending", url: PENDING, targetAudience: "", targetRegions: [], contexts: [], cta: "" },
  ],
  paidData: { status: "disabled", stripePaymentLinkUrl: "" },
};
function page(p: Partial<BuiltPage> & { html: string }): BuiltPage {
  return { path: "/pref/tokyo/", lastmod: "2026-09-01", hasAffiliate: false, isDataPage: false, ...p };
}
function fakeFetch(table: Record<string, number>, calls: string[] = []): FetchLike {
  return async (url, init) => {
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
    const s = table[url];
    if (s === undefined) throw new TypeError("fetch failed");
    return new Response(null, { status: s });
  };
}

describe("G4 affiliateGate", () => {
  it("ASP_URL_RE matches known ASP hosts", () => {
    expect(ASP_URL_RE.test("https://px.a8.net/x")).toBe(true);
    expect(ASP_URL_RE.test("https://ck.jp.ap.valuecommerce.com/x")).toBe(true);
    expect(ASP_URL_RE.test("https://www.mhlw.go.jp/")).toBe(false);
  });

  it("PASS: only active urls, liveness ok, flags consistent (checks each active url once)", async () => {
    const calls: string[] = [];
    const pages = [
      page({ html: `<a href="${ACTIVE}" rel="sponsored nofollow">x</a>`, hasAffiliate: true }),
      page({ path: "/pref/osaka/", html: `<a href="${ACTIVE}" rel="sponsored nofollow">x</a>`, hasAffiliate: true }),
      page({ path: "/about/", html: `<p>no links</p>` }),
    ];
    const g = affiliateGate(pages, m, { fetch: fakeFetch({ [ACTIVE]: 200 }, calls) });
    expect(g.id).toBe("G4");
    expect(g.name).toBe("収益リンク");
    const r = await g.run();
    expect(r.messages).toEqual([]);
    expect(r.status).toBe("PASS");
    expect(calls).toEqual([`HEAD ${ACTIVE}`]);
  });

  it("FAIL: non-active ASP url appears on a page", async () => {
    const pages = [page({ html: `<a href="${PENDING}">x</a><a href="https://ck.jp.ap.valuecommerce.com/z">y</a>`, hasAffiliate: true })];
    const r = await affiliateGate(pages, m, { fetch: fakeFetch({ [ACTIVE]: 200 }) }).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toContain(PENDING);
    expect(msg).toContain("valuecommerce");
    expect(msg).toContain("/pref/tokyo/");
  });

  it("FAIL: active url is dead (checkLiveness)", async () => {
    const pages = [page({ html: `<a href="${ACTIVE}">x</a>`, hasAffiliate: true })];
    const r = await affiliateGate(pages, m, { fetch: fakeFetch({ [ACTIVE]: 404 }) }).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages[0]).toContain("404");
  });

  it("checkLiveness=false skips network", async () => {
    const calls: string[] = [];
    const pages = [page({ html: `<a href="${ACTIVE}">x</a>`, hasAffiliate: true })];
    const r = await affiliateGate(pages, m, { fetch: fakeFetch({}, calls), checkLiveness: false }).run();
    expect(r.status).toBe("PASS");
    expect(calls).toEqual([]);
  });

  it("FAIL: hasAffiliate flag inconsistent with content (both directions)", async () => {
    const pages = [
      page({ path: "/a/", html: `<p>none</p>`, hasAffiliate: true }),
      page({ path: "/b/", html: `<a href="${ACTIVE}">x</a>`, hasAffiliate: false }),
    ];
    const r = await affiliateGate(pages, m, { fetch: fakeFetch({ [ACTIVE]: 200 }) }).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toContain("/a/");
    expect(msg).toContain("/b/");
  });

  it("treats &amp; in href as & when matching", async () => {
    const url = "https://px.a8.net/svt/ejp?a8mat=X&y=1";
    const mm: Monetization = { ...m, programs: [{ ...m.programs[0]!, url }] };
    const pages = [page({ html: `<a href="https://px.a8.net/svt/ejp?a8mat=X&amp;y=1">x</a>`, hasAffiliate: true })];
    const r = await affiliateGate(pages, mm, { fetch: fakeFetch({ [url]: 200 }) }).run();
    expect(r.status).toBe("PASS");
  });
});
