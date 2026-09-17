import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCycle, type Paths } from "../../src/cli/lib.js";
import { PREFECTURES } from "../../src/normalize/types.js";

/** 統計ダッシュボード API の形をした偽レスポンスを URL のパラメータから組み立てる */
function fakeDashboard(url: string, opts: { prefCount?: number; scale?: number; months?: string[] }) {
  const u = new URL(url);
  const code = u.searchParams.get("IndicatorCode")!;
  const rank = u.searchParams.get("RegionalRank");
  const months = opts.months ?? ["20250500", "20250600", "20250700", "20250800", "20250900", "20251000", "20251100", "20251200", "20260100", "20260200", "20260300", "20260400", "20260500", "20260600", "20260700"];
  const regions = rank === "2" ? ["00000"] : PREFECTURES.slice(0, opts.prefCount ?? 47).map((p) => `${p.code}000`);
  const objs: unknown[] = [];
  regions.forEach((r, ri) => {
    months.forEach((t, ti) => {
      const base = r === "00000" ? 1.2 : 0.8 + (ri % 10) * 0.1;
      const v = ((base + ti * 0.01) * (opts.scale ?? 1)).toFixed(2);
      for (const seasonal of ["1", "2"]) {
        objs.push({ VALUE: { "@indicator": code, "@unit": "104", "@stat": "x", "@regionCode": r, "@time": t, "@cycle": "1", "@regionRank": rank, "@isSeasonal": seasonal, "@isProvisional": "0", $: v } });
      }
    });
  });
  const body = { GET_STATS: { RESULT: { status: "0", errorMsg: "ok", date: "" }, PARAMETER: {}, STATISTICAL_DATA: { RESULT_INF: { TOTAL_NUMBER: String(objs.length) }, TABLE_INF: {}, DATA_INF: { DATA_OBJ: objs } } } };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

async function makeProject(programStatus: "pending" | "active"): Promise<Paths> {
  const root = await mkdtemp(path.join(tmpdir(), "career-stats-"));
  await mkdir(path.join(root, "config"), { recursive: true });
  const site = JSON.parse(await readFile(path.join(process.cwd(), "config/site.json"), "utf8"));
  const mon = JSON.parse(await readFile(path.join(process.cwd(), "config/monetization.json"), "utf8"));
  if (programStatus === "active") {
    mon.programs[0].status = "active";
    mon.programs[0].url = "https://px.a8.net/svt/ejp?a8mat=TEST+ABC";
  }
  await writeFile(path.join(root, "config/site.json"), JSON.stringify(site));
  await writeFile(path.join(root, "config/monetization.json"), JSON.stringify(mon));
  return { root, siteConfig: path.join(root, "config/site.json"), monetizationConfig: path.join(root, "config/monetization.json"), dataDir: path.join(root, "data/normalized"), siteDir: path.join(root, "site") };
}

const exists = (p: string) => stat(p).then(() => true, () => false);
const now = () => new Date("2026-09-18T03:00:00Z");

describe("runCycle", () => {
  let logs: string[];
  beforeEach(() => { logs = []; });
  const log = (s: string) => logs.push(s);

  it("collect → build → check succeeds offline and writes site + data", async () => {
    const paths = await makeProject("pending");
    const code = await runCycle({ paths, fetch: async (u) => fakeDashboard(u, {}), now, offline: true, log });
    expect(logs.join("\n")).toContain("[check] PASS");
    expect(code).toBe(0);
    expect(await exists(path.join(paths.siteDir, "index.html"))).toBe(true);
    expect(await exists(path.join(paths.siteDir, "pref/tokyo/index.html"))).toBe(true);
    expect(await exists(path.join(paths.siteDir, "sitemap.xml"))).toBe(true);
    expect(await exists(path.join(paths.dataDir, "active_openings_ratio.json"))).toBe(true);
    const html = await readFile(path.join(paths.siteDir, "pref/tokyo/index.html"), "utf8");
    expect(html).toContain("加工して作成");
    expect(html).not.toContain("a8.net");
  });

  it("with an active program, targeted pages carry the CTA and gates still pass (liveness mocked)", async () => {
    const paths = await makeProject("active");
    const fetch = async (u: string) => (u.includes("a8.net") ? new Response("", { status: 200 }) : fakeDashboard(u, {}));
    const code = await runCycle({ paths, fetch, now, offline: true, log });
    expect(code, logs.join("\n")).toBe(0);
    const tokyo = await readFile(path.join(paths.siteDir, "pref/tokyo/index.html"), "utf8");
    expect(tokyo).toContain("px.a8.net");
    expect(tokyo).toContain("プロモーション");
  });

  it("fails and removes site/ when values are out of range (G1)", async () => {
    const paths = await makeProject("pending");
    const code = await runCycle({ paths, fetch: async (u) => fakeDashboard(u, { scale: 10 }), now, offline: true, log });
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("[FAIL] G1");
    expect(await exists(paths.siteDir)).toBe(false);
  });

  it("fails when a prefecture is missing from the source", async () => {
    const paths = await makeProject("pending");
    const code = await runCycle({ paths, fetch: async (u) => fakeDashboard(u, { prefCount: 46 }), now, offline: true, log });
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("ERROR");
    expect(await exists(paths.siteDir)).toBe(false);
  });

  it("fails on stale data (G6) when the latest period is far in the past", async () => {
    const paths = await makeProject("pending");
    const old = ["20240100", "20240200", "20240300", "20240400", "20240500", "20240600", "20240700", "20240800", "20240900", "20241000", "20241100", "20241200", "20250100"];
    const code = await runCycle({ paths, fetch: async (u) => fakeDashboard(u, { months: old }), now, offline: true, log });
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("[FAIL] G6");
  });
});
