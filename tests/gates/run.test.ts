import { describe, it, expect } from "vitest";
import { runGates, type Gate, type GateReport } from "../../src/gates/run.js";

const pass: Gate = { id: "G0", name: "always pass", run: async () => ({ status: "PASS", messages: [] }) };
const warn: Gate = { id: "G1", name: "warns", run: async () => ({ status: "WARN", messages: ["old data"] }) };
const fail: Gate = { id: "G2", name: "fails", run: async () => ({ status: "FAIL", messages: ["missing 3 prefectures"] }) };
const throws: Gate = { id: "G3", name: "throws", run: async () => { throw new Error("boom"); } };

describe("runGates", () => {
  it("passes when all gates pass", async () => {
    const r = await runGates([pass]);
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
  });
  it("is ok with warnings but records them", async () => {
    const r = await runGates([pass, warn]);
    expect(r.ok).toBe(true);
    expect(r.results.find((x) => x.id === "G1")?.status).toBe("WARN");
    expect(r.warnings).toEqual(["G1 warns: old data"]);
  });
  it("fails when any gate fails and lists failures", async () => {
    const r = await runGates([pass, fail, warn]);
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual(["G2 fails: missing 3 prefectures"]);
  });
  it("treats a throwing gate as FAIL with the error message", async () => {
    const r = await runGates([throws]);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toContain("boom");
  });
  it("formats a human-readable report", async () => {
    const r: GateReport = await runGates([pass, fail]);
    const text = r.toText();
    expect(text).toContain("[PASS] G0 always pass");
    expect(text).toContain("[FAIL] G2 fails");
    expect(text).toContain("missing 3 prefectures");
  });
});
