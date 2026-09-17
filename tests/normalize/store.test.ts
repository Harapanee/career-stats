import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  latestPeriod,
  mergeDataset,
  readStore,
  regionsAt,
  seriesFor,
  storeDigest,
  valueAt,
  writeStore,
} from "../../src/normalize/store.js";
import type { Dataset, Observation, RegionCode, Store } from "../../src/normalize/types.js";

const obs = (region: RegionCode, period: string, value: number): Observation => ({
  metric: "active_openings_ratio",
  region,
  period,
  value,
});

const ds = (observations: Observation[], over: Partial<Dataset> = {}): Dataset => ({
  metric: "active_openings_ratio",
  unit: "倍",
  sourceName: "一般職業紹介状況",
  sourceUrl: "https://example.com/old.xlsx",
  termsUrl: "https://example.com/terms",
  fetchedAt: "2026-01-01T00:00:00Z",
  rawSha256: "old",
  observations,
  ...over,
});

describe("mergeDataset", () => {
  it("returns incoming sorted when existing is undefined", () => {
    const out = mergeDataset(undefined, ds([obs("13", "2026-02", 1.8), obs("01", "2026-01", 1.0)]));
    expect(out.observations.map((o) => `${o.region}:${o.period}`)).toEqual(["01:2026-01", "13:2026-02"]);
  });

  it("overrides duplicates with incoming and sorts by region then period", () => {
    const existing = ds([obs("13", "2026-01", 1.7), obs("13", "2026-02", 1.8), obs("JP", "2026-01", 1.2)]);
    const incoming = ds([obs("13", "2026-02", 1.9), obs("01", "2026-03", 1.1)], {
      sourceUrl: "https://example.com/new.xlsx",
      fetchedAt: "2026-03-01T00:00:00Z",
      rawSha256: "new",
    });
    const out = mergeDataset(existing, incoming);
    expect(out.observations).toEqual([
      obs("01", "2026-03", 1.1),
      obs("13", "2026-01", 1.7),
      obs("13", "2026-02", 1.9),
      obs("JP", "2026-01", 1.2),
    ]);
    expect(out.sourceUrl).toBe("https://example.com/new.xlsx");
    expect(out.fetchedAt).toBe("2026-03-01T00:00:00Z");
    expect(out.rawSha256).toBe("new");
  });
});

describe("accessors", () => {
  const d = ds([
    obs("13", "2026-02", 1.8),
    obs("13", "2025-12", 1.6),
    obs("13", "2026-01", 1.7),
    obs("JP", "2026-01", 1.2),
    obs("01", "2026-01", 1.0),
  ]);

  it("latestPeriod returns the max period, undefined when empty", () => {
    expect(latestPeriod(d)).toBe("2026-02");
    expect(latestPeriod(ds([]))).toBeUndefined();
  });

  it("seriesFor returns ascending series for a region", () => {
    expect(seriesFor(d, "13")).toEqual([
      { period: "2025-12", value: 1.6 },
      { period: "2026-01", value: 1.7 },
      { period: "2026-02", value: 1.8 },
    ]);
    expect(seriesFor(d, "47")).toEqual([]);
  });

  it("valueAt returns value or undefined", () => {
    expect(valueAt(d, "13", "2026-01")).toBe(1.7);
    expect(valueAt(d, "13", "2024-01")).toBeUndefined();
  });

  it("regionsAt lists regions having a value at the period (sorted)", () => {
    expect(regionsAt(d, "2026-01")).toEqual(["01", "13", "JP"]);
    expect(regionsAt(d, "2026-02")).toEqual(["13"]);
    expect(regionsAt(d, "2020-01")).toEqual([]);
  });
});

describe("readStore / writeStore", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("round-trips deep-equal through a temp dir", async () => {
    dir = await mkdtemp(join(tmpdir(), "store-"));
    const store: Store = {
      datasets: {
        active_openings_ratio: ds([obs("13", "2026-02", 1.8), obs("01", "2026-01", 1.0)]),
        unemployment_rate: ds([obs("JP", "2026-01", 2.5)], { metric: "unemployment_rate", unit: "%" }),
      },
    };
    const sub = join(dir, "nested", "normalized");
    await writeStore(sub, store);
    const back = await readStore(sub);
    const expected: Store = {
      datasets: {
        active_openings_ratio: ds([obs("01", "2026-01", 1.0), obs("13", "2026-02", 1.8)]),
        unemployment_rate: store.datasets.unemployment_rate,
      },
    };
    expect(back).toEqual(expected);
  });

  it("returns an empty store for a missing or empty dir", async () => {
    dir = await mkdtemp(join(tmpdir(), "store-"));
    expect(await readStore(dir)).toEqual({ datasets: {} });
    expect(await readStore(join(dir, "does-not-exist"))).toEqual({ datasets: {} });
  });
});

describe("storeDigest", () => {
  it("is stable for equal content and changes when a value changes", () => {
    const a: Store = { datasets: { active_openings_ratio: ds([obs("13", "2026-01", 1.7)]) } };
    const b: Store = { datasets: { active_openings_ratio: ds([obs("13", "2026-01", 1.7)]) } };
    const c: Store = { datasets: { active_openings_ratio: ds([obs("13", "2026-01", 1.8)]) } };
    expect(storeDigest(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(storeDigest(a)).toBe(storeDigest(b));
    expect(storeDigest(a)).not.toBe(storeDigest(c));
  });
});

describe("storeDigest ignores volatile metadata", () => {
  it("is unchanged when only fetchedAt / rawSha256 differ", () => {
    const base: Dataset = {
      metric: "active_openings_ratio", unit: "倍", sourceName: "s", sourceUrl: "u", termsUrl: "t",
      fetchedAt: "2026-09-18T00:00:00.000Z", rawSha256: "a", observations: [{ metric: "active_openings_ratio", region: "JP", period: "2026-07", value: 1.18 }],
    };
    const a: Store = { datasets: { active_openings_ratio: base } };
    const b: Store = { datasets: { active_openings_ratio: { ...base, fetchedAt: "2026-09-25T00:00:00.000Z", rawSha256: "b" } } };
    expect(storeDigest(a)).toBe(storeDigest(b));
  });
});
