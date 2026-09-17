import { describe, it, expect } from "vitest";
import { stalenessGate, monthEnd, DEFAULT_WARN_DAYS, DEFAULT_FAIL_DAYS } from "../../src/gates/staleness.js";
import type { Dataset, MetricId, Store } from "../../src/normalize/types.js";

function ds(metric: MetricId, periods: string[]): Dataset {
  return {
    metric, unit: "", sourceName: "s", sourceUrl: "https://s.test/", termsUrl: "https://s.test/t", fetchedAt: "", rawSha256: "x",
    observations: periods.map((period) => ({ metric, region: "JP" as const, period, value: 1 })),
  };
}

describe("G6 stalenessGate", () => {
  it("defaults and monthEnd", () => {
    expect(DEFAULT_WARN_DAYS).toBe(90);
    expect(DEFAULT_FAIL_DAYS).toBe(180);
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2024-02")).toBe("2024-02-29");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });

  it("PASS: latest period within 90 days", async () => {
    const store: Store = { datasets: { active_openings_ratio: ds("active_openings_ratio", ["2026-06", "2026-07"]) } };
    const g = stalenessGate(store, "2026-09-18");
    expect(g.id).toBe("G6");
    expect(g.name).toBe("出典更新遅延");
    const r = await g.run();
    expect(r.status).toBe("PASS");
  });

  it("WARN: older than 90 days but within 180", async () => {
    const store: Store = { datasets: { active_openings_ratio: ds("active_openings_ratio", ["2026-04"]) } };
    const r = await stalenessGate(store, "2026-09-18").run();
    expect(r.status).toBe("WARN");
    expect(r.messages[0]).toContain("active_openings_ratio");
    expect(r.messages[0]).toContain("2026-04");
  });

  it("FAIL: older than 180 days", async () => {
    const store: Store = { datasets: { active_openings_ratio: ds("active_openings_ratio", ["2025-12"]) } };
    const r = await stalenessGate(store, "2026-09-18").run();
    expect(r.status).toBe("FAIL");
    expect(r.messages[0]).toContain("2025-12");
  });

  it("FAIL: empty store or dataset without observations", async () => {
    expect((await stalenessGate({ datasets: {} }, "2026-09-18").run()).status).toBe("FAIL");
    const store: Store = { datasets: { job_changers: ds("job_changers", []) } };
    expect((await stalenessGate(store, "2026-09-18").run()).status).toBe("FAIL");
  });

  it("custom thresholds; worst status wins across datasets", async () => {
    const store: Store = {
      datasets: {
        active_openings_ratio: ds("active_openings_ratio", ["2026-08"]),
        unemployment_rate: ds("unemployment_rate", ["2026-05"]),
      },
    };
    const r = await stalenessGate(store, "2026-09-18", { warnDays: 30, failDays: 400 }).run();
    expect(r.status).toBe("WARN");
    expect(r.messages.some((x) => x.includes("unemployment_rate"))).toBe(true);
  });
});
