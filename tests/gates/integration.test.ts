import { describe, it, expect } from "vitest";
import { runGates } from "../../src/gates/run.js";
import { dataGate, stalenessGate, qualityGate, legalTextGate, affiliateGate, sourceLivenessGate } from "../../src/gates/index.js";
import type { Store } from "../../src/normalize/types.js";
import type { Monetization } from "../../src/monetize/types.js";

describe("gates integration via runGates", () => {
  it("runs every gate factory and aggregates failures", async () => {
    const store: Store = { datasets: {} };
    const m: Monetization = { disclosure: "PR", programs: [], paidData: { status: "disabled", stripePaymentLinkUrl: "" } };
    const fetch = async () => new Response(null, { status: 200 });
    const report = await runGates([
      dataGate(store),
      sourceLivenessGate(["https://ok.test/"], { fetch }),
      legalTextGate([], m),
      affiliateGate([], m, { fetch }),
      qualityGate([], { maxPages: 10, baseUrl: "https://x.test", contactEmail: "a@b" }),
      stalenessGate(store, "2026-09-18"),
    ]);
    expect(report.ok).toBe(false);
    expect(report.results.map((r) => r.id)).toEqual(["G1", "G2", "G3", "G4", "G5", "G6"]);
    expect(report.results.find((r) => r.id === "G2")?.status).toBe("PASS");
    expect(report.results.find((r) => r.id === "G3")?.status).toBe("PASS");
    expect(report.results.find((r) => r.id === "G4")?.status).toBe("PASS");
    expect(report.failures.some((f) => f.startsWith("G1 "))).toBe(true);
    expect(report.failures.some((f) => f.startsWith("G5 "))).toBe(true);
    expect(report.failures.some((f) => f.startsWith("G6 "))).toBe(true);
    expect(report.toText()).toContain("[FAIL] G1 データ異常");
  });
});
