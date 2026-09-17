/**
 * 派生値(DerivedStats)から決定的な日本語の要約文を組み立てる。
 * LLM・乱数は使わない。同じ入力からは常に同じ出力になる。
 * 出力はプレーンテキスト(HTML エスケープは呼び出し側が行う)。
 */
import type { DerivedStats } from "../normalize/derive.js";
import { formatNumber } from "./svg.js";

/** 派生値。src/normalize/derive.ts の DerivedStats をそのまま使う(別名は互換のため残す) */
export type DerivedStatsLike = DerivedStats;

export interface SummaryNames {
  region: string;
  metric: string;
  unit: string;
}

/** 「大きく」を付ける前月差の閾値 */
const BIG_DIFF = 0.05;
/** これ未満の差は「横ばい」「同水準」とみなす(表示上 0 に丸まる幅) */
const ZERO_EPS = 0.005;
/** 上位/下位帯の幅 */
const BAND = 10;

/** "2026-07" → "2026年7月" */
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return `${m[1]}年${Number(m[2])}月`;
}

/** 符号付き数値。正は "+"、負は "-"、ゼロは "±0" */
export function signed(n: number, decimals = 2): string {
  const s = formatNumber(n, decimals);
  if (s === "0") return "±0";
  return s.startsWith("-") ? s : `+${s}`;
}

function momSentence(diff: number | null, unit: string): string | null {
  if (diff === null || !Number.isFinite(diff)) return null;
  if (Math.abs(diff) < ZERO_EPS) return "前月から横ばいです。";
  const big = Math.abs(diff) >= BIG_DIFF ? "大きく" : "";
  const dir = diff > 0 ? "上昇" : "低下";
  return `前月比${signed(diff)}${unit}と${big}${dir}しました。`;
}

function yoySentence(diff: number | null, unit: string): string | null {
  if (diff === null || !Number.isFinite(diff)) return null;
  if (Math.abs(diff) < ZERO_EPS) return "前年同月と同じ水準です。";
  const dir = diff > 0 ? "上回って" : "下回って";
  return `前年同月比は${signed(diff)}${unit}で、前年の水準を${dir}います。`;
}

function rankBand(rank: number, rankOf: number): string {
  if (rank === 1) return "全国1位";
  if (rank <= BAND) return `全国${rank}位(上位${BAND}位以内)`;
  if (rank > rankOf - BAND) return `全国${rank}位(下位${BAND}位以内)`;
  return `全国${rank}位(中位)`;
}

function nationalPhrase(diff: number, unit: string): string {
  if (Math.abs(diff) < ZERO_EPS) return "全国平均と同水準です";
  const dir = diff > 0 ? "上回っています" : "下回っています";
  return `全国平均を${formatNumber(Math.abs(diff))}${unit}${dir}`;
}

function rankSentence(d: DerivedStatsLike, unit: string): string | null {
  if (d.region === "JP") return null;
  const rank = d.rank === null ? null : `${d.rankOf}都道府県中${rankBand(d.rank, d.rankOf)}`;
  const nat = d.nationalDiff !== null && Number.isFinite(d.nationalDiff) ? nationalPhrase(d.nationalDiff, unit) : null;
  if (rank && nat) return `${rank}で、${nat}。`;
  if (rank) return `${rank}です。`;
  return nat ? `${nat}。` : null;
}

function recordSentence(d: DerivedStatsLike, unit: string): string | null {
  const v = `${formatNumber(d.value)}${unit}`;
  if (d.isRecordHigh) return `${v}は集計期間内で最も高い水準で、過去最高を更新しました。`;
  if (d.isRecordLow) return `${v}は集計期間内で最も低い水準で、過去最低を更新しました。`;
  return null;
}

function trendSentence(t: DerivedStatsLike["trend3m"]): string {
  if (t === "up") return "直近3か月は上昇傾向です。";
  if (t === "down") return "直近3か月は低下傾向です。";
  return "直近3か月は横ばいで推移しています。";
}

function rangeSentence(d: DerivedStatsLike, unit: string): string {
  const mx = d.maxInSeries;
  const mn = d.minInSeries;
  return `集計期間内の最高値は${periodLabel(mx.period)}の${formatNumber(mx.value)}${unit}、最低値は${periodLabel(mn.period)}の${formatNumber(mn.value)}${unit}です。`;
}

/** 3〜6 文の要約。データの特徴で分岐し、地域ごとに本文が変わる */
export function summarySentences(d: DerivedStatsLike, names: SummaryNames): string[] {
  const { unit } = names;
  const out: string[] = [
    `${periodLabel(d.period)}の${names.region}の${names.metric}は${formatNumber(d.value)}${unit}です。`,
  ];
  const push = (s: string | null): void => {
    if (s) out.push(s);
  };
  push(momSentence(d.momDiff, unit));
  push(yoySentence(d.yoyDiff, unit));
  push(rankSentence(d, unit));
  push(recordSentence(d, unit));
  out.push(trendSentence(d.trend3m));
  if (out.length < 3) out.push(rangeSentence(d, unit));
  return out.slice(0, 6);
}
