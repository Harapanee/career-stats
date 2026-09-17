import { describe, expect, it } from "vitest";
import { periodLabel, signed, summarySentences, type DerivedStatsLike } from "../../src/render/text.js";

const PROHIBITED = [
  "No.1", "1位のエージェント", "おすすめ度", "満足度", "必ず", "絶対", "業界最高", "報酬",
  "成果条件", "確定率", "応募する", "求人詳細", "求人番号", "募集中", "採用情報",
];

const base = (over: Partial<DerivedStatsLike> = {}): DerivedStatsLike => ({
  region: "13",
  period: "2026-07",
  value: 1.85,
  momDiff: 0.02,
  yoyDiff: -0.1,
  rank: 3,
  rankOf: 47,
  maxInSeries: { period: "2019-12", value: 2.1 },
  minInSeries: { period: "2020-09", value: 1.2 },
  isRecordHigh: false,
  isRecordLow: false,
  trend3m: "up",
  nationalDiff: 0.6,
  ...over,
});
const names = { region: "東京都", metric: "有効求人倍率", unit: "倍" };
const join = (d: DerivedStatsLike): string => summarySentences(d, names).join("");

describe("periodLabel", () => {
  it("converts YYYY-MM to 日本語", () => {
    expect(periodLabel("2026-07")).toBe("2026年7月");
    expect(periodLabel("2025-12")).toBe("2025年12月");
  });
});

describe("signed", () => {
  it("formats positive / negative / zero", () => {
    expect(signed(0.02)).toBe("+0.02");
    expect(signed(-0.1)).toBe("-0.1");
    expect(signed(0)).toBe("±0");
    expect(signed(1.234, 1)).toBe("+1.2");
  });
});

describe("summarySentences", () => {
  it("starts with the headline sentence", () => {
    expect(summarySentences(base(), names)[0]).toBe("2026年7月の東京都の有効求人倍率は1.85倍です。");
  });

  it("returns 3 to 6 sentences", () => {
    for (const d of [base(), base({ region: "JP", rank: null, nationalDiff: null, yoyDiff: null })]) {
      const n = summarySentences(d, names).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("varies with momDiff sign, magnitude and null", () => {
    const up = join(base({ momDiff: 0.02 }));
    const bigUp = join(base({ momDiff: 0.08 }));
    const down = join(base({ momDiff: -0.03 }));
    const flat = join(base({ momDiff: 0 }));
    const none = join(base({ momDiff: null }));
    expect(new Set([up, bigUp, down, flat, none]).size).toBe(5);
    expect(up).toContain("上昇");
    expect(bigUp).toContain("大きく");
    expect(up).not.toContain("大きく");
    expect(down).toContain("低下");
    expect(flat).toContain("横ばい");
    expect(none).not.toContain("前月");
  });

  it("skips the yoy sentence when null", () => {
    expect(join(base({ yoyDiff: 0.05 }))).toContain("前年同月");
    expect(join(base({ yoyDiff: null }))).not.toContain("前年同月");
  });

  it("writes rank band and national comparison", () => {
    expect(join(base({ rank: 1 }))).toContain("全国1位");
    expect(join(base({ rank: 3 }))).toContain("上位");
    expect(join(base({ rank: 20 }))).toContain("中位");
    expect(join(base({ rank: 45 }))).toContain("下位");
    expect(join(base({ nationalDiff: 0.6 }))).toContain("上回");
    expect(join(base({ nationalDiff: -0.2 }))).toContain("下回");
    expect(join(base({ nationalDiff: 0 }))).toContain("同水準");
  });

  it("has no rank sentence for JP", () => {
    const s = join(base({ region: "JP", rank: null, nationalDiff: null }));
    expect(s).not.toContain("位");
    expect(s).not.toContain("全国平均");
  });

  it("mentions record high / low only when flagged", () => {
    expect(join(base({ isRecordHigh: true }))).toContain("最も高い");
    expect(join(base({ isRecordLow: true }))).toContain("最も低い");
    expect(join(base())).not.toContain("最も");
  });

  it("describes the 3-month trend", () => {
    expect(join(base({ trend3m: "up" }))).toContain("直近3か月は上昇傾向");
    expect(join(base({ trend3m: "down" }))).toContain("直近3か月は低下傾向");
    expect(join(base({ trend3m: "flat" }))).toContain("直近3か月は横ばい");
  });

  it("is deterministic", () => {
    expect(summarySentences(base(), names)).toEqual(summarySentences(base(), names));
  });

  it("never emits prohibited words or HTML", () => {
    const variants: DerivedStatsLike[] = [];
    for (const momDiff of [0.1, 0.01, 0, -0.01, -0.1, null])
      for (const rank of [1, 5, 24, 40, 47, null])
        for (const flag of [[true, false], [false, true], [false, false]] as const)
          variants.push(base({ momDiff, rank, isRecordHigh: flag[0], isRecordLow: flag[1], trend3m: rank === 24 ? "down" : "flat" }));
    for (const d of variants) {
      const s = join(d);
      for (const w of PROHIBITED) expect(s, `prohibited: ${w}`).not.toContain(w);
      expect(s).not.toMatch(/[<>]/);
    }
  });
});
