/**
 * 統計ダッシュボード(総務省統計局)API アダプタ。利用登録不要(docs/data-sources.md D1)。
 * 実測(2026-09-18): `RegionalRank=3&TimeFrom=...` で全都道府県×複数月を 1 回で取得できる。
 * 完全失業率(0301010000020020010)は RegionalRank=3 が status "1"(該当データなし)のため全国のみ。
 */
import type { Dataset, MetricId, Observation, RegionCode } from "../normalize/types.js";
import { PREFECTURES } from "../normalize/types.js";
import { fetchJson, sha256Hex, type FetchLike } from "./http.js";

export interface DashboardIndicator {
  code: string;
  metric: MetricId;
  unit: string;
  /** "1" = 原数値, "2" = 季節調整値 */
  seasonal: "1" | "2";
  label: string;
  /** 都道府県別(RegionalRank=3)データが存在するか */
  prefectural: boolean;
}

export type DashboardMetricId = "active_openings_ratio" | "new_openings_ratio" | "unemployment_rate";

export const INDICATORS: Record<DashboardMetricId, DashboardIndicator> = {
  active_openings_ratio: {
    code: "0301020001000010010",
    metric: "active_openings_ratio",
    unit: "倍",
    seasonal: "2",
    label: "有効求人倍率(季節調整値)",
    prefectural: true,
  },
  new_openings_ratio: {
    code: "0301020002000010010",
    metric: "new_openings_ratio",
    unit: "倍",
    seasonal: "2",
    label: "新規求人倍率(季節調整値)",
    prefectural: true,
  },
  unemployment_rate: {
    code: "0301010000020020010",
    metric: "unemployment_rate",
    unit: "%",
    seasonal: "2",
    label: "完全失業率(季節調整値)",
    prefectural: false,
  },
};

export const DASHBOARD_SOURCE = {
  name: "統計ダッシュボード(総務省統計局)",
  url: "https://dashboard.e-stat.go.jp/",
  termsUrl: "https://dashboard.e-stat.go.jp/static/terms",
  apiBase: "https://dashboard.e-stat.go.jp/api/1.0/Json/getData",
} as const;

/** 既定の取得開始月(YYYYMM00) */
export const DEFAULT_TIME_FROM = "20150100";

export function buildUrl(
  ind: DashboardIndicator,
  q: { regionalRank: 2 | 3; timeFrom?: string; time?: string },
): string {
  const p = new URLSearchParams({ IndicatorCode: ind.code, Cycle: "1", RegionalRank: String(q.regionalRank) });
  if (q.time) p.set("Time", q.time);
  else if (q.timeFrom) p.set("TimeFrom", q.timeFrom);
  return `${DASHBOARD_SOURCE.apiBase}?${p.toString()}`;
}

interface DataObj {
  VALUE?: Record<string, string | undefined>;
}
interface DashboardJson {
  GET_STATS?: {
    RESULT?: { status?: string; errorMsg?: string };
    STATISTICAL_DATA?: { RESULT_INF?: { TOTAL_NUMBER?: string }; DATA_INF?: { DATA_OBJ?: DataObj[] } };
  };
}

/** "00000" → "JP", "13000" → "13"。それ以外(市区町村など)は undefined */
function toRegion(code: string | undefined): RegionCode | undefined {
  if (code === "00000") return "JP";
  if (!code || !/^\d{5}$/.test(code) || !code.endsWith("000")) return undefined;
  const pref = code.slice(0, 2);
  return PREFECTURES.some((p) => p.code === pref) ? (pref as RegionCode) : undefined;
}

/** "20260700" → "2026-07" */
function toPeriod(time: string | undefined): string | undefined {
  const m = time && /^(\d{4})(\d{2})\d{2}$/.exec(time);
  return m ? `${m[1]}-${m[2]}` : undefined;
}

function compareObs(a: Observation, b: Observation): number {
  return a.region < b.region ? -1 : a.region > b.region ? 1 : a.period < b.period ? -1 : a.period > b.period ? 1 : 0;
}

export function parseDashboard(json: unknown, ind: DashboardIndicator): Observation[] {
  const root = (json as DashboardJson)?.GET_STATS;
  const status = root?.RESULT?.status;
  if (status !== "0") {
    throw new Error(`dashboard API returned status ${status ?? "(none)"}: ${root?.RESULT?.errorMsg ?? "no RESULT"}`);
  }
  const objs = root?.STATISTICAL_DATA?.DATA_INF?.DATA_OBJ ?? [];
  const out: Observation[] = [];
  for (const { VALUE: v } of objs) {
    if (!v || v["@isSeasonal"] !== ind.seasonal) continue;
    const region = toRegion(v["@regionCode"]);
    const period = toPeriod(v["@time"]);
    const raw = v["$"];
    if (!region || !period || raw === undefined || !/^-?\d+(\.\d+)?$/.test(raw.trim())) continue;
    out.push({ metric: ind.metric, region, period, value: Number(raw) });
  }
  return out.sort(compareObs);
}

export interface CollectDeps {
  fetch?: FetchLike;
  now?: () => Date;
  /** YYYYMM00。既定 "20150100" */
  timeFrom?: string;
}

function assertAllPrefectures(obs: Observation[], ind: DashboardIndicator): void {
  const prefObs = obs.filter((o) => o.region !== "JP");
  const latest = prefObs.reduce((m, o) => (o.period > m ? o.period : m), "");
  const regions = new Set(prefObs.filter((o) => o.period === latest).map((o) => o.region));
  if (regions.size < PREFECTURES.length) {
    const missing = PREFECTURES.filter((p) => !regions.has(p.code)).map((p) => p.code);
    throw new Error(
      `${ind.label}: latest period ${latest || "(none)"} has ${regions.size} prefectures (missing ${missing.join(",")})`,
    );
  }
}

export async function collectIndicator(ind: DashboardIndicator, deps: CollectDeps): Promise<Dataset> {
  const timeFrom = deps.timeFrom ?? DEFAULT_TIME_FROM;
  const now = deps.now ?? (() => new Date());
  const ranks: (2 | 3)[] = ind.prefectural ? [2, 3] : [2];
  const observations: Observation[] = [];
  const chunks: Uint8Array[] = [];
  let sourceUrl = "";
  for (const regionalRank of ranks) {
    const url = buildUrl(ind, { regionalRank, timeFrom });
    const { data, file } = await fetchJson(url, { fetch: deps.fetch });
    observations.push(...parseDashboard(data, ind));
    chunks.push(file.bytes);
    sourceUrl = url;
  }
  if (ind.prefectural) assertAllPrefectures(observations, ind);
  const raw = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  chunks.reduce((off, c) => (raw.set(c, off), off + c.length), 0);
  return {
    metric: ind.metric,
    unit: ind.unit,
    sourceName: `${DASHBOARD_SOURCE.name} / ${ind.label}`,
    sourceUrl,
    termsUrl: DASHBOARD_SOURCE.termsUrl,
    fetchedAt: now().toISOString(),
    rawSha256: sha256Hex(raw),
    observations: observations.sort(compareObs),
  };
}

export async function collectAll(deps: CollectDeps): Promise<Dataset[]> {
  const out: Dataset[] = [];
  for (const ind of Object.values(INDICATORS)) out.push(await collectIndicator(ind, deps));
  return out;
}
