import { describe, expect, it } from "vitest";
import { derive, prevPeriod, rankTable } from "../../src/normalize/derive.js";
import type { Dataset, Observation, RegionCode } from "../../src/normalize/types.js";

const obs = (region: RegionCode, period: string, value: number): Observation => ({
  metric: "active_openings_ratio",
  region,
  period,
  value,
});

const series = (region: RegionCode, start: string, values: number[]): Observation[] => {
  const [y, m] = start.split("-").map(Number) as [number, number];
  return values.map((v, i) => {
    const idx = y * 12 + (m - 1) + i;
    return obs(region, `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`, v);
  });
};

// 東京(13): 15 か月、2025-01..2026-03。最新が過去最高、初月が過去最低
const tokyo = series("13", "2025-01", [1.6, 1.62, 1.65, 1.63, 1.66, 1.7, 1.72, 1.71, 1.75, 1.78, 1.8, 1.82, 1.85, 1.84, 1.9]);
// 北海道(01): 4 か月、下降
const hokkaido = series("01", "2025-12", [1.4, 1.35, 1.32, 1.3]);
// 沖縄(47): 4 か月、3 か月前との差がちょうど -0.01(flat 境界)
const okinawa = series("47", "2025-12", [1.11, 1.12, 1.115, 1.1]);
// 大阪(27): 2 か月、同値
const osaka = series("27", "2026-02", [1.3, 1.3]);
// 全国(JP): 3 か月
const jp = series("JP", "2026-01", [1.2, 1.22, 1.25]);

const ds: Dataset = {
  metric: "active_openings_ratio",
  unit: "倍",
  sourceName: "一般職業紹介状況",
  sourceUrl: "https://example.com/a.xlsx",
  termsUrl: "https://example.com/terms",
  fetchedAt: "2026-04-01T00:00:00Z",
  rawSha256: "x",
  // 意図的に順序をばらす
  observations: [...osaka, ...jp, ...okinawa, ...tokyo, ...hokkaido].reverse(),
};

describe("prevPeriod", () => {
  it("steps back across year boundaries", () => {
    expect(prevPeriod("2026-01", 1)).toBe("2025-12");
    expect(prevPeriod("2026-03", 12)).toBe("2025-03");
    expect(prevPeriod("2026-01", 3)).toBe("2025-10");
    expect(prevPeriod("2026-01", 13)).toBe("2024-12");
    expect(prevPeriod("2025-05", 0)).toBe("2025-05");
  });
});

describe("derive", () => {
  it("defaults to the region's latest period and computes diffs rounded to 2 decimals", () => {
    const d = derive(ds, "13");
    expect(d.region).toBe("13");
    expect(d.period).toBe("2026-03");
    expect(d.value).toBe(1.9);
    expect(d.momDiff).toBe(0.06);
    expect(d.yoyDiff).toBe(0.25);
    expect(d.nationalDiff).toBe(0.65);
    expect(d.trend3m).toBe("up");
    expect(d.maxInSeries).toEqual({ period: "2026-03", value: 1.9 });
    expect(d.minInSeries).toEqual({ period: "2025-01", value: 1.6 });
    expect(d.isRecordHigh).toBe(true);
    expect(d.isRecordLow).toBe(false);
  });

  it("ranks prefectures with shared ranks (1,2,2,4) and excludes JP", () => {
    const d = derive(ds, "13");
    expect(d.rank).toBe(1);
    expect(d.rankOf).toBe(4);
    expect(derive(ds, "01", "2026-03").rank).toBe(2);
    expect(derive(ds, "27", "2026-03").rank).toBe(2);
    expect(derive(ds, "47", "2026-03").rank).toBe(4);
    const nat = derive(ds, "JP");
    expect(nat.rank).toBeNull();
    expect(nat.rankOf).toBe(4);
    expect(nat.nationalDiff).toBeNull();
  });

  it("returns null diffs when previous month / last year / national value is missing", () => {
    const first = derive(ds, "13", "2025-01");
    expect(first.momDiff).toBeNull();
    expect(first.yoyDiff).toBeNull();
    expect(first.nationalDiff).toBeNull();
    expect(first.trend3m).toBe("flat");
    expect(first.isRecordLow).toBe(true);
    expect(first.isRecordHigh).toBe(false);
    expect(first.rank).toBe(1);
    expect(first.rankOf).toBe(1);
    const mid = derive(ds, "13", "2025-06");
    expect(mid.momDiff).toBe(0.04);
    expect(mid.yoyDiff).toBeNull();
    expect(mid.nationalDiff).toBeNull();
  });

  it("requires at least 12 points for record high/low", () => {
    const d = derive(ds, "27");
    expect(d.isRecordHigh).toBe(false);
    expect(d.isRecordLow).toBe(false);
    expect(d.momDiff).toBe(0);
    expect(d.maxInSeries).toEqual({ period: "2026-02", value: 1.3 });
    expect(d.minInSeries).toEqual({ period: "2026-02", value: 1.3 });
  });

  it("applies trend3m thresholds", () => {
    expect(derive(ds, "01").trend3m).toBe("down");
    expect(derive(ds, "01").momDiff).toBe(-0.02);
    expect(derive(ds, "47").trend3m).toBe("flat");
    expect(derive(ds, "27").trend3m).toBe("flat");
  });

  it("throws when the region has no data", () => {
    expect(() => derive(ds, "46")).toThrow();
    expect(() => derive(ds, "13", "2020-01")).toThrow();
  });
});

describe("rankTable", () => {
  it("lists prefectures by value desc then code asc with shared ranks", () => {
    expect(rankTable(ds, "2026-03")).toEqual([
      { region: "13", value: 1.9, rank: 1 },
      { region: "01", value: 1.3, rank: 2 },
      { region: "27", value: 1.3, rank: 2 },
      { region: "47", value: 1.1, rank: 4 },
    ]);
    expect(rankTable(ds, "2020-01")).toEqual([]);
  });
});
