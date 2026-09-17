import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_SOURCE,
  INDICATORS,
  buildUrl,
  collectAll,
  collectIndicator,
  parseDashboard,
} from "../../src/sources/dashboard.js";
import type { FetchLike } from "../../src/sources/http.js";

const FIX = new URL("../fixtures/dashboard/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, FIX), "utf8");
const prefJson = read("active-pref-202607.json");
const nationalJson = read("active-national-from-202501.json");
const noDataJson = read("unemployment-pref-nodata.json");

const ACTIVE = INDICATORS.active_openings_ratio;
const now = () => new Date("2026-09-18T00:00:00Z");

/** RegionalRank に応じて fixture を返す fake fetch */
function fakeFetch(pref = prefJson, national = nationalJson): FetchLike {
  return async (url) => {
    const rank = new URL(url).searchParams.get("RegionalRank");
    const body = rank === "3" ? pref : national;
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  };
}

/** fixture から regionCode を 1 件除いた JSON を返す */
function dropRegion(json: string, regionCode: string): string {
  const j = JSON.parse(json);
  const objs = j.GET_STATS.STATISTICAL_DATA.DATA_INF.DATA_OBJ as { VALUE: Record<string, string> }[];
  j.GET_STATS.STATISTICAL_DATA.DATA_INF.DATA_OBJ = objs.filter((o) => o.VALUE["@regionCode"] !== regionCode);
  return JSON.stringify(j);
}

describe("INDICATORS / DASHBOARD_SOURCE", () => {
  it("defines the three indicators with seasonal-adjusted codes", () => {
    expect(ACTIVE.code).toBe("0301020001000010010");
    expect(INDICATORS.new_openings_ratio.code).toBe("0301020002000010010");
    expect(INDICATORS.unemployment_rate.code).toBe("0301010000020020010");
    expect(INDICATORS.unemployment_rate.prefectural).toBe(false);
    expect(Object.values(INDICATORS).every((i) => i.seasonal === "2")).toBe(true);
    expect(DASHBOARD_SOURCE.termsUrl).toBe("https://dashboard.e-stat.go.jp/static/terms");
  });
});

describe("buildUrl", () => {
  it("builds a prefectural multi-month URL", () => {
    const u = new URL(buildUrl(ACTIVE, { regionalRank: 3, timeFrom: "20240100" }));
    expect(u.origin + u.pathname).toBe(DASHBOARD_SOURCE.apiBase);
    expect(u.searchParams.get("IndicatorCode")).toBe(ACTIVE.code);
    expect(u.searchParams.get("Cycle")).toBe("1");
    expect(u.searchParams.get("RegionalRank")).toBe("3");
    expect(u.searchParams.get("TimeFrom")).toBe("20240100");
    expect(u.searchParams.has("Time")).toBe(false);
  });

  it("builds a single-month national URL", () => {
    const u = new URL(buildUrl(ACTIVE, { regionalRank: 2, time: "20260700" }));
    expect(u.searchParams.get("RegionalRank")).toBe("2");
    expect(u.searchParams.get("Time")).toBe("20260700");
  });
});

describe("parseDashboard", () => {
  it("maps region codes and periods, keeping only seasonal-adjusted values", () => {
    const obs = parseDashboard(JSON.parse(prefJson), ACTIVE);
    expect(obs).toHaveLength(47);
    expect(obs.every((o) => o.metric === "active_openings_ratio" && o.period === "2026-07")).toBe(true);
    expect(obs.find((o) => o.region === "13")?.value).toBe(1.69);
    expect(obs.find((o) => o.region === "47")?.value).toBe(0.93);
  });

  it("maps 00000 to JP and sorts periods", () => {
    const obs = parseDashboard(JSON.parse(nationalJson), ACTIVE);
    expect(obs).toHaveLength(19);
    expect(obs.every((o) => o.region === "JP")).toBe(true);
    expect(obs[0]?.period).toBe("2025-01");
    expect(obs.at(-1)).toEqual({ metric: "active_openings_ratio", region: "JP", period: "2026-07", value: 1.18 });
  });

  it("skips non-numeric values and tolerates a missing DATA_OBJ", () => {
    const j = JSON.parse(prefJson);
    j.GET_STATS.STATISTICAL_DATA.DATA_INF.DATA_OBJ[1].VALUE["$"] = "-";
    expect(parseDashboard(j, ACTIVE).length).toBeLessThanOrEqual(47);
    const empty = { GET_STATS: { RESULT: { status: "0" }, STATISTICAL_DATA: { RESULT_INF: { TOTAL_NUMBER: "0" }, DATA_INF: {} } } };
    expect(parseDashboard(empty, ACTIVE)).toEqual([]);
  });

  it("throws when RESULT.status is not 0", () => {
    expect(() => parseDashboard(JSON.parse(noDataJson), INDICATORS.unemployment_rate)).toThrow(/status 1/);
    expect(() => parseDashboard({}, ACTIVE)).toThrow();
  });
});

describe("collectIndicator", () => {
  it("merges national and prefectural series into one Dataset", async () => {
    const fetch = vi.fn(fakeFetch());
    const ds = await collectIndicator(ACTIVE, { fetch, now });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ds.metric).toBe("active_openings_ratio");
    expect(ds.unit).toBe("倍");
    expect(ds.sourceName).toBe("統計ダッシュボード(総務省統計局) / 有効求人倍率(季節調整値)");
    expect(ds.sourceUrl).toContain("RegionalRank=3");
    expect(ds.termsUrl).toBe(DASHBOARD_SOURCE.termsUrl);
    expect(ds.fetchedAt).toBe("2026-09-18T00:00:00.000Z");
    expect(ds.rawSha256).toMatch(/^[0-9a-f]{64}$/);
    const latest = ds.observations.filter((o) => o.period === "2026-07");
    expect(latest.filter((o) => o.region !== "JP")).toHaveLength(47);
    expect(latest.find((o) => o.region === "JP")?.value).toBe(1.18);
    const keys = ds.observations.map((o) => `${o.region}:${o.period}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("throws when a prefecture is missing for the latest period", async () => {
    const fetch = fakeFetch(dropRegion(prefJson, "13000"));
    await expect(collectIndicator(ACTIVE, { fetch, now })).rejects.toThrow(/46/);
  });

  it("fetches only the national series for national-only indicators", async () => {
    const fetch = vi.fn(fakeFetch());
    const ds = await collectIndicator(INDICATORS.unemployment_rate, { fetch, now });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ds.sourceUrl).toContain("RegionalRank=2");
    expect(ds.observations.every((o) => o.region === "JP")).toBe(true);
  });
});

describe("collectAll", () => {
  it("collects every indicator with the expected number of requests", async () => {
    const fetch = vi.fn(fakeFetch());
    const all = await collectAll({ fetch, now });
    expect(all.map((d) => d.metric)).toEqual(["active_openings_ratio", "new_openings_ratio", "unemployment_rate"]);
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
