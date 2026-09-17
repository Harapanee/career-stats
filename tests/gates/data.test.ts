import { describe, it, expect } from "vitest";
import { dataGate, DEFAULT_RANGES, DEFAULT_MAX_MOM_CHANGE_RATIO } from "../../src/gates/data.js";
import { PREFECTURES, type Dataset, type MetricId, type Observation, type Store } from "../../src/normalize/types.js";

function prefObs(metric: MetricId, period: string, value: number, opts?: { skip?: string[] }): Observation[] {
  const out: Observation[] = [{ metric, region: "JP", period, value }];
  for (const p of PREFECTURES) {
    if (opts?.skip?.includes(p.code)) continue;
    out.push({ metric, region: p.code, period, value });
  }
  return out;
}

function dataset(metric: MetricId, observations: Observation[]): Dataset {
  return {
    metric,
    unit: "倍",
    sourceName: "一般職業紹介状況",
    sourceUrl: "https://example.test/src",
    termsUrl: "https://example.test/terms",
    fetchedAt: "2026-09-01T00:00:00Z",
    rawSha256: "abc",
    observations,
  };
}

const goodStore: Store = {
  datasets: {
    active_openings_ratio: dataset("active_openings_ratio", [
      ...prefObs("active_openings_ratio", "2026-06", 1.2),
      ...prefObs("active_openings_ratio", "2026-07", 1.25),
    ]),
    unemployment_rate: dataset("unemployment_rate", [
      { metric: "unemployment_rate", region: "JP", period: "2026-06", value: 2.5 },
      { metric: "unemployment_rate", region: "JP", period: "2026-07", value: 2.6 },
    ]),
  },
};

describe("G1 dataGate", () => {
  it("exports defaults", () => {
    expect(DEFAULT_RANGES.active_openings_ratio).toEqual({ min: 0.2, max: 5.0 });
    expect(DEFAULT_MAX_MOM_CHANGE_RATIO).toBe(0.3);
  });

  it("PASS: 47 prefectures + JP, values in range, small MoM change; national-only dataset ok", async () => {
    const g = dataGate(goodStore);
    expect(g.id).toBe("G1");
    expect(g.name).toBe("データ異常");
    const r = await g.run();
    expect(r.status).toBe("PASS");
    expect(r.messages).toEqual([]);
  });

  it("FAIL: empty store", async () => {
    const r = await dataGate({ datasets: {} }).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages[0]).toContain("データセット");
  });

  it("FAIL: latest period is missing prefectures (names the missing ones)", async () => {
    const store: Store = {
      datasets: {
        active_openings_ratio: dataset("active_openings_ratio", [
          ...prefObs("active_openings_ratio", "2026-06", 1.2),
          ...prefObs("active_openings_ratio", "2026-07", 1.2, { skip: ["13", "27"] }),
        ]),
      },
    };
    const r = await dataGate(store).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toContain("active_openings_ratio");
    expect(msg).toContain("2026-07");
    expect(msg).toContain("13");
    expect(msg).toContain("27");
  });

  it("FAIL: value out of range / non-finite, with region and value in message", async () => {
    const obs = prefObs("active_openings_ratio", "2026-07", 1.2);
    obs[1] = { ...obs[1]!, value: 7.5 }; // 01 北海道
    obs[2] = { ...obs[2]!, value: Number.NaN }; // 02
    const r = await dataGate({ datasets: { active_openings_ratio: dataset("active_openings_ratio", obs) } }).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toMatch(/01.*7\.5/);
    expect(msg).toMatch(/02.*NaN/);
  });

  it("FAIL: month-over-month change above 30%", async () => {
    const store: Store = {
      datasets: {
        active_openings_ratio: dataset("active_openings_ratio", [
          ...prefObs("active_openings_ratio", "2026-06", 1.0),
          ...prefObs("active_openings_ratio", "2026-07", 1.0).map((o) => (o.region === "13" ? { ...o, value: 1.4 } : o)),
        ]),
      },
    };
    const r = await dataGate(store).run();
    expect(r.status).toBe("FAIL");
    expect(r.messages.join("\n")).toMatch(/13.*前月比/);
    // 緩めれば通る
    const r2 = await dataGate(store, { maxMomChangeRatio: 0.5 }).run();
    expect(r2.status).toBe("PASS");
  });

  it("FAIL: bad period format and duplicate (region, period)", async () => {
    const store: Store = {
      datasets: {
        unemployment_rate: dataset("unemployment_rate", [
          { metric: "unemployment_rate", region: "JP", period: "2026-13", value: 2.5 },
          { metric: "unemployment_rate", region: "JP", period: "2026-07", value: 2.5 },
          { metric: "unemployment_rate", region: "JP", period: "2026-07", value: 2.6 },
        ]),
      },
    };
    const r = await dataGate(store).run();
    expect(r.status).toBe("FAIL");
    const msg = r.messages.join("\n");
    expect(msg).toContain("2026-13");
    expect(msg).toMatch(/重複/);
  });

  it("custom ranges override defaults", async () => {
    const r = await dataGate(goodStore, { ranges: { active_openings_ratio: { min: 2, max: 3 } } }).run();
    expect(r.status).toBe("FAIL");
  });
});
