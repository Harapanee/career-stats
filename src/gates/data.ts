/** G1 データ異常: 47 県の揃い・値域・期間形式・重複・前月比の急変を検査する。 */
import { PREFECTURES, type MetricId, type Observation, type Store } from "../normalize/types.js";
import { result, type Gate } from "./types.js";

export interface ValueRange {
  min: number;
  max: number;
}

export const DEFAULT_RANGES: Record<MetricId, ValueRange> = {
  active_openings_ratio: { min: 0.2, max: 5.0 },
  new_openings_ratio: { min: 0.2, max: 8.0 },
  unemployment_rate: { min: 0, max: 15 },
  job_changers: { min: 0, max: 1000 },
};

export const DEFAULT_MAX_MOM_CHANGE_RATIO = 0.3;
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface DataGateOptions {
  ranges?: Partial<Record<MetricId, ValueRange>>;
  maxMomChangeRatio?: number;
}

function checkDataset(metric: MetricId, obs: Observation[], opts: DataGateOptions, out: string[]): void {
  if (obs.length === 0) {
    out.push(`${metric}: 観測値が 0 件`);
    return;
  }
  const range = opts.ranges?.[metric] ?? DEFAULT_RANGES[metric];
  const maxRatio = opts.maxMomChangeRatio ?? DEFAULT_MAX_MOM_CHANGE_RATIO;
  const seen = new Set<string>();
  const byRegion = new Map<string, Observation[]>();
  let latest = "";
  for (const o of obs) {
    if (!PERIOD_RE.test(o.period)) out.push(`${metric}: ${o.region} の期間 "${o.period}" が YYYY-MM 形式でない`);
    else if (o.period > latest) latest = o.period;
    const key = `${o.region}|${o.period}`;
    if (seen.has(key)) out.push(`${metric}: ${o.region} ${o.period} が重複`);
    seen.add(key);
    if (!Number.isFinite(o.value)) out.push(`${metric}: ${o.region} ${o.period} の値が数値でない(${String(o.value)})`);
    else if (o.value < range.min || o.value > range.max)
      out.push(`${metric}: ${o.region} ${o.period} の値 ${o.value} が範囲外(${range.min}〜${range.max})`);
    const list = byRegion.get(o.region) ?? [];
    list.push(o);
    byRegion.set(o.region, list);
  }
  if (!latest) return;

  // 最新期の地域の揃い
  const latestRegions = new Set(obs.filter((o) => o.period === latest).map((o) => o.region));
  const hasPrefectural = obs.some((o) => o.region !== "JP");
  if (hasPrefectural) {
    const missing = PREFECTURES.filter((p) => !latestRegions.has(p.code)).map((p) => `${p.code} ${p.name}`);
    if (missing.length > 0) out.push(`${metric}: 最新期 ${latest} に ${missing.length} 県が欠落(${missing.join(", ")})`);
  }
  if (obs.some((o) => o.region === "JP") && !latestRegions.has("JP")) out.push(`${metric}: 最新期 ${latest} に全国(JP)が欠落`);

  // 前月比(各地域の最新 2 期)
  for (const [region, list] of byRegion) {
    const sorted = list.filter((o) => PERIOD_RE.test(o.period) && Number.isFinite(o.value)).sort((a, b) => a.period.localeCompare(b.period));
    const cur = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    if (!cur || !prev || prev.value === 0) continue;
    const ratio = Math.abs(cur.value - prev.value) / Math.abs(prev.value);
    if (ratio > maxRatio)
      out.push(
        `${metric}: ${region} の前月比が ${(ratio * 100).toFixed(1)}%(${prev.period} ${prev.value} → ${cur.period} ${cur.value})で上限 ${maxRatio * 100}% 超`,
      );
  }
}

export function dataGate(store: Store, opts: DataGateOptions = {}): Gate {
  return {
    id: "G1",
    name: "データ異常",
    run: () => {
      const out: string[] = [];
      const entries = Object.entries(store.datasets) as [MetricId, Store["datasets"][MetricId]][];
      if (entries.length === 0) return result(["データセットが 1 つもない"]);
      for (const [metric, ds] of entries) {
        if (!ds) continue;
        checkDataset(metric, ds.observations, opts, out);
      }
      return result(out);
    },
  };
}
