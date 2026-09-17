/**
 * 派生値。Dataset から前月差・前年同月差・全国順位・記録更新・3 か月トレンドなどを
 * 決定的に導出する。文章生成(render/text)はこの結果だけを参照する。
 */
import { seriesFor, valueAt } from "./store.js";
import type { Dataset, RegionCode } from "./types.js";

export interface DerivedStats {
  region: RegionCode;
  period: string;
  value: number;
  /** 前月差(前月が無ければ null) */
  momDiff: number | null;
  /** 前年同月差(前年同月が無ければ null) */
  yoyDiff: number | null;
  /** 都道府県内順位(1 = 最大値、同値は同順位 1,2,2,4 方式)。JP またはデータ無しは null */
  rank: number | null;
  /** その期間に値を持つ都道府県数 */
  rankOf: number;
  maxInSeries: { period: string; value: number };
  minInSeries: { period: string; value: number };
  /** 系列長 12 以上かつ現在値が系列の最大/最小と一致 */
  isRecordHigh: boolean;
  isRecordLow: boolean;
  /** 3 か月前との比較。差 > 0.01 で up、< -0.01 で down、それ以外(欠損含む)は flat */
  trend3m: "up" | "down" | "flat";
  /** 全国値との差(JP 自身または全国値欠損は null) */
  nationalDiff: number | null;
}

const RECORD_MIN_POINTS = 12;
const TREND_EPS = 0.01;

/** 小数第 2 位に丸める(0.30000000000000004 対策)。-0 は 0 に正規化 */
export function round2(x: number): number {
  return Math.round(x * 100) / 100 + 0;
}

const diffOrNull = (a: number, b: number | undefined): number | null => (b === undefined ? null : round2(a - b));

/** "YYYY-MM" から months か月前の "YYYY-MM" を返す */
export function prevPeriod(period: string, months: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`invalid period: ${period}`);
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) - months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** 指定期間の都道府県ランキング(JP 除外)。値の降順 → 地域コード昇順、同値は同順位 */
export function rankTable(ds: Dataset, period: string): { region: RegionCode; value: number; rank: number }[] {
  const rows = ds.observations
    .filter((o) => o.period === period && o.region !== "JP")
    .map((o) => ({ region: o.region, value: o.value }))
    .sort((a, b) => b.value - a.value || (a.region < b.region ? -1 : a.region > b.region ? 1 : 0));
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.value !== rows[i - 1]?.value) rank = i + 1;
    return { ...row, rank };
  });
}

export function derive(ds: Dataset, region: RegionCode, period?: string): DerivedStats {
  const series = seriesFor(ds, region);
  if (series.length === 0) throw new Error(`no data for region ${region} (${ds.metric})`);
  const last = series[series.length - 1]!;
  const current = period === undefined ? last : series.find((p) => p.period === period);
  if (!current) throw new Error(`no data for region ${region} at ${period} (${ds.metric})`);

  let max = series[0]!;
  let min = series[0]!;
  for (const p of series) {
    if (p.value > max.value) max = p;
    if (p.value < min.value) min = p;
  }
  const enoughForRecord = series.length >= RECORD_MIN_POINTS;

  const at = (monthsBack: number) => valueAt(ds, region, prevPeriod(current.period, monthsBack));
  const diff3m = diffOrNull(current.value, at(3));
  const trend3m = diff3m === null ? "flat" : diff3m > TREND_EPS ? "up" : diff3m < -TREND_EPS ? "down" : "flat";

  const table = rankTable(ds, current.period);
  const rank = region === "JP" ? null : (table.find((r) => r.region === region)?.rank ?? null);
  const nationalDiff = region === "JP" ? null : diffOrNull(current.value, valueAt(ds, "JP", current.period));

  return {
    region,
    period: current.period,
    value: current.value,
    momDiff: diffOrNull(current.value, at(1)),
    yoyDiff: diffOrNull(current.value, at(12)),
    rank,
    rankOf: table.length,
    maxInSeries: { period: max.period, value: max.value },
    minInSeries: { period: min.period, value: min.value },
    isRecordHigh: enoughForRecord && current.value === max.value,
    isRecordLow: enoughForRecord && current.value === min.value,
    trend3m,
    nationalDiff,
  };
}
