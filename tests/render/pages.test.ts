import { describe, it, expect } from "vitest";
import { buildAllPages } from "../../src/render/pages.js";
import type { Dataset, MetricId, Observation, RegionCode, Store } from "../../src/normalize/types.js";
import { PREFECTURES } from "../../src/normalize/types.js";
import type { Monetization } from "../../src/monetize/types.js";
import type { SiteConfig } from "../../src/render/page.js";

function periods(n: number, end = "2026-07"): string[] {
  const [y, m] = end.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

export function syntheticDataset(metric: MetricId, unit: string, prefectural: boolean, months = 15): Dataset {
  const obs: Observation[] = [];
  const ps = periods(months);
  const regions: RegionCode[] = prefectural ? ["JP", ...PREFECTURES.map((p) => p.code)] : ["JP"];
  regions.forEach((region, ri) => {
    ps.forEach((period, pi) => {
      const base = region === "JP" ? 1.2 : 0.8 + (ri % 10) * 0.1;
      obs.push({ metric, region, period, value: Math.round((base + pi * 0.01) * 100) / 100 });
    });
  });
  return {
    metric,
    unit,
    sourceName: `統計ダッシュボード / ${metric}`,
    sourceUrl: `https://dashboard.e-stat.go.jp/api/1.0/Json/getData?IndicatorCode=${metric}`,
    termsUrl: "https://dashboard.e-stat.go.jp/static/terms",
    fetchedAt: "2026-09-18T00:00:00.000Z",
    rawSha256: "abc",
    observations: obs,
  };
}

export const store: Store = {
  datasets: {
    active_openings_ratio: syntheticDataset("active_openings_ratio", "倍", true),
    new_openings_ratio: syntheticDataset("new_openings_ratio", "倍", true),
    unemployment_rate: syntheticDataset("unemployment_rate", "%", false),
  },
};

export const site: SiteConfig = {
  name: "テストラボ",
  tagline: "t",
  baseUrl: "https://example.com/career-stats",
  operator: { name: "harateck", contactEmail: "k@example.com" },
  locale: "ja",
  maxPages: 300,
  searchConsoleVerification: "",
  adsense: { publisherId: "" },
};

const neo = {
  id: "neo",
  name: "就職エージェントneo",
  advertiser: "株式会社ネオキャリア",
  asp: "A8.net",
  aspProgramId: "s1",
  status: "active" as const,
  url: "https://px.a8.net/svt/ejp?a8mat=TEST+ABC",
  targetAudience: "新卒",
  targetRegions: ["13", "14", "12", "11", "27", "26", "28"],
  contexts: ["new-graduate"],
  cta: "相談する",
};
export const monetizationActive: Monetization = {
  disclosure: "本ページにはプロモーション(アフィリエイト広告)が含まれています。",
  programs: [neo],
  paidData: { status: "pending", stripePaymentLinkUrl: "" },
};
const monetizationPending: Monetization = { ...monetizationActive, programs: [{ ...neo, status: "pending", url: "" }] };

describe("buildAllPages", () => {
  const pages = buildAllPages({ site, monetization: monetizationActive, store, today: "2026-09-18" });
  const byPath = (p: string) => pages.find((x) => x.path === p)!;

  it("builds the expected page set within maxPages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(47 + 3 + 2 + 3 + 2);
    expect(pages.length).toBeLessThanOrEqual(site.maxPages);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
    for (const p of ["/", "/pref/", "/pref/tokyo/", "/metrics/", "/metrics/active-openings-ratio/", "/metrics/unemployment-rate/", "/about/", "/privacy/", "/ads-policy/", "/404.html"]) {
      expect(byPath(p), p).toBeDefined();
    }
  });

  it("prefecture page has chart, derived values, sources and is a data page", () => {
    const tokyo = byPath("/pref/tokyo/");
    expect(tokyo.isDataPage).toBe(true);
    expect(tokyo.html).toContain("<svg");
    for (const w of ["前月", "前年同月", "全国順位", "過去最高", "過去最低", "加工して作成", "出典"]) expect(tokyo.html).toContain(w);
    expect(tokyo.html).toContain('rel="canonical" href="https://example.com/career-stats/pref/tokyo/"');
  });

  it("shows the CTA and disclosure only in targeted prefectures", () => {
    const tokyo = byPath("/pref/tokyo/");
    const hokkaido = byPath("/pref/hokkaido/");
    expect(tokyo.hasAffiliate).toBe(true);
    expect(tokyo.html).toContain("px.a8.net");
    expect(tokyo.html).toContain('rel="sponsored nofollow noopener"');
    expect(tokyo.html.indexOf("プロモーション")).toBeLessThan(tokyo.html.indexOf("<article"));
    expect(hokkaido.hasAffiliate).toBe(false);
    expect(hokkaido.html).not.toContain("px.a8.net");
  });

  it("has no affiliate anywhere when programs are pending", () => {
    const p2 = buildAllPages({ site, monetization: monetizationPending, store, today: "2026-09-18" });
    expect(p2.every((p) => !p.hasAffiliate && !p.html.includes("a8.net"))).toBe(true);
  });

  it("home and metric pages carry national values; 404 is noindex", () => {
    expect(byPath("/").html).toContain("全国");
    expect(byPath("/metrics/unemployment-rate/").html).toContain("%");
    expect(byPath("/404.html").html).toContain('name="robots" content="noindex"');
  });

  it("is deterministic", () => {
    const again = buildAllPages({ site, monetization: monetizationActive, store, today: "2026-09-18" });
    expect(again.map((p) => p.html).join("")).toBe(pages.map((p) => p.html).join(""));
  });

  it("throws without the active openings dataset", () => {
    expect(() => buildAllPages({ site, monetization: monetizationActive, store: { datasets: {} }, today: "2026-09-18" })).toThrow();
  });
});
