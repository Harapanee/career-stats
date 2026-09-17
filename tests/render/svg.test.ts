import { describe, expect, it } from "vitest";
import {
  escapeXml,
  formatNumber,
  renderBarChart,
  renderLineChart,
  type LineChartOptions,
  type BarChartOptions,
} from "../../src/render/svg.js";

const months = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `2024-${String((i % 12) + 1).padStart(2, "0")}`);

const lineOpts = (over: Partial<LineChartOptions> = {}): LineChartOptions => ({
  title: "有効求人倍率の推移",
  series: [
    {
      label: "全国",
      points: months(6).map((x, i) => ({ x, y: 1.2 + i * 0.05 })),
    },
  ],
  yUnit: "倍",
  ...over,
});

const barOpts = (over: Partial<BarChartOptions> = {}): BarChartOptions => ({
  title: "都道府県別",
  items: [
    { label: "東京都", value: 1.85, highlight: true },
    { label: "大阪府", value: 1.3 },
    { label: "北海道", value: 0.95 },
  ],
  unit: "倍",
  ...over,
});

describe("escapeXml", () => {
  it("escapes & < > \"", () => {
    expect(escapeXml('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });
  it("leaves plain text unchanged", () => {
    expect(escapeXml("有効求人倍率")).toBe("有効求人倍率");
  });
});

describe("formatNumber", () => {
  it("trims trailing zeros", () => {
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(1.234)).toBe("1.23");
    expect(formatNumber(1.8500000001)).toBe("1.85");
  });
  it("handles negative and custom decimals", () => {
    expect(formatNumber(-0.5)).toBe("-0.5");
    expect(formatNumber(-3)).toBe("-3");
    expect(formatNumber(1.23456, 3)).toBe("1.235");
    expect(formatNumber(1.5, 0)).toBe("2");
  });
  it("never yields NaN text", () => {
    expect(formatNumber(Number.NaN)).toBe("0");
  });
});

describe("renderLineChart", () => {
  it("starts with svg root, includes escaped title", () => {
    const svg = renderLineChart(lineOpts({ title: 'A & B <"C">' }));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    expect(svg).toMatch(/role="img" aria-label="A &amp; B &lt;&quot;C&quot;&gt;"/);
    expect(svg).toContain("<title>A &amp; B &lt;&quot;C&quot;&gt;</title>");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("uses custom width/height and ariaLabel", () => {
    const svg = renderLineChart(lineOpts({ width: 500, height: 300, ariaLabel: "ラベル" }));
    expect(svg).toContain('viewBox="0 0 500 300"');
    expect(svg).toContain('aria-label="ラベル"');
  });

  it("draws one polyline per series and a legend when series > 1", () => {
    const single = renderLineChart(lineOpts());
    expect(single.match(/<polyline/g)?.length).toBe(1);
    expect(single).not.toContain('class="legend"');

    const multi = renderLineChart(
      lineOpts({
        series: [
          { label: "全国", points: months(6).map((x, i) => ({ x, y: 1 + i * 0.1 })) },
          { label: "東京", points: months(6).map((x, i) => ({ x, y: 2 + i * 0.1 })) },
        ],
      }),
    );
    expect(multi.match(/<polyline/g)?.length).toBe(2);
    expect(multi).toContain('class="legend"');
    expect(multi).toContain("東京");
  });

  it("breaks polylines at null gaps", () => {
    const svg = renderLineChart(
      lineOpts({
        series: [
          {
            label: "s",
            points: [
              { x: "2024-01", y: 1 },
              { x: "2024-02", y: 1.1 },
              { x: "2024-03", y: null },
              { x: "2024-04", y: 1.2 },
              { x: "2024-05", y: 1.3 },
            ],
          },
        ],
      }),
    );
    expect(svg.match(/<polyline/g)?.length).toBe(2);
  });

  it("draws ~5 y ticks with nice values and unit", () => {
    const svg = renderLineChart(lineOpts({ yMin: 0, yMax: 2, yUnit: "倍" }));
    const ticks = svg.match(/class="ytick"/g)?.length ?? 0;
    expect(ticks).toBeGreaterThanOrEqual(3);
    expect(ticks).toBeLessThanOrEqual(8);
    expect(svg).toContain(">0倍<");
    expect(svg).toContain(">2倍<");
  });

  it("thins x labels to at most 12", () => {
    const svg = renderLineChart(
      lineOpts({ series: [{ label: "s", points: months(60).map((x, i) => ({ x, y: i })) }] }),
    );
    const xl = svg.match(/class="xlabel"/g)?.length ?? 0;
    expect(xl).toBeGreaterThanOrEqual(2);
    expect(xl).toBeLessThanOrEqual(12);
  });

  it("formats numbers with at most 2 decimals", () => {
    const svg = renderLineChart(
      lineOpts({ series: [{ label: "s", points: months(7).map((x, i) => ({ x, y: 1 / 3 + i / 7 })) }] }),
    );
    expect(svg).not.toMatch(/\d\.\d{3,}/);
  });

  it("does not throw on empty/single data and shows データなし when no numeric points", () => {
    const empty = renderLineChart(lineOpts({ series: [] }));
    expect(empty).toContain("<title>");
    expect(empty).toContain("データなし");

    const allNull = renderLineChart(
      lineOpts({ series: [{ label: "s", points: [{ x: "2024-01", y: null }] }] }),
    );
    expect(allNull).toContain("データなし");

    const single = renderLineChart(
      lineOpts({ series: [{ label: "s", points: [{ x: "2024-01", y: 1.5 }] }] }),
    );
    expect(single).not.toContain("データなし");
    expect(single).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("is deterministic and free of NaN/undefined", () => {
    const a = renderLineChart(lineOpts());
    const b = renderLineChart(lineOpts());
    expect(a).toBe(b);
    expect(a).not.toMatch(/NaN|undefined/);
  });

  it("handles a flat series (yMin === yMax) without NaN", () => {
    const svg = renderLineChart(
      lineOpts({ series: [{ label: "s", points: months(4).map((x) => ({ x, y: 1.5 })) }] }),
    );
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("renderBarChart", () => {
  it("renders one rect per item, highlight class, labels and values", () => {
    const svg = renderBarChart(barOpts());
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    expect(svg).toContain("<title>都道府県別</title>");
    expect(svg.match(/<rect class="bar/g)?.length).toBe(3);
    expect(svg.match(/class="bar highlight"/g)?.length).toBe(1);
    expect(svg).toContain("東京都");
    expect(svg).toContain(">1.85倍<");
    expect(svg).toContain(">0.95倍<");
  });

  it("auto-grows height with item count", () => {
    const items = Array.from({ length: 47 }, (_, i) => ({ label: `県${i}`, value: i / 10 }));
    const small = renderBarChart(barOpts());
    const big = renderBarChart(barOpts({ items }));
    const h = (s: string): number => Number(/viewBox="0 0 \d+ (\d+)"/.exec(s)?.[1]);
    expect(h(big)).toBeGreaterThan(h(small));
    expect(h(big)).toBeGreaterThanOrEqual(47 * 22);
    expect(big.match(/<rect class="bar/g)?.length).toBe(47);
  });

  it("supports vertical bars", () => {
    const svg = renderBarChart(barOpts({ horizontal: false, height: 300 }));
    expect(svg).toContain('viewBox="0 0 ');
    expect(svg.match(/<rect class="bar/g)?.length).toBe(3);
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it("escapes labels and shows データなし for empty items", () => {
    const svg = renderBarChart(barOpts({ items: [{ label: "A<B>&\"", value: 1 }] }));
    expect(svg).toContain("A&lt;B&gt;&amp;&quot;");
    const empty = renderBarChart(barOpts({ items: [] }));
    expect(empty).toContain("データなし");
    expect(empty).toContain("<title>都道府県別</title>");
  });

  it("handles negative and zero values without NaN", () => {
    const svg = renderBarChart(
      barOpts({ items: [{ label: "a", value: -1 }, { label: "b", value: 0 }, { label: "c", value: 2 }] }),
    );
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect(svg).toContain(">-1倍<");
  });

  it("is deterministic", () => {
    expect(renderBarChart(barOpts())).toBe(renderBarChart(barOpts()));
  });
});
