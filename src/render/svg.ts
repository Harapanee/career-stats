/**
 * 純粋関数のSVGレンダラ(折れ線・棒グラフ)。I/Oなし・外部依存なし・決定的出力。
 */

export interface SeriesPoint {
  x: string;
  y: number | null;
}
export interface Series {
  label: string;
  points: SeriesPoint[];
}
export interface LineChartOptions {
  title: string;
  series: Series[];
  width?: number;
  height?: number;
  yUnit?: string;
  yMin?: number;
  yMax?: number;
  ariaLabel?: string;
}
export interface BarItem {
  label: string;
  value: number;
  highlight?: boolean;
}
export interface BarChartOptions {
  title: string;
  items: BarItem[];
  width?: number;
  height?: number;
  unit?: string;
  horizontal?: boolean;
  ariaLabel?: string;
}

const PALETTE = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e", "#9467bd", "#8c564b"];
const FONT = 'font-family="sans-serif"';
const NO_DATA = "データなし";

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(decimals);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

const f = (n: number): string => formatNumber(n, 2);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function svgOpen(w: number, h: number, title: string, aria: string | undefined): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" role="img" aria-label="${escapeXml(aria ?? title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<rect x="0" y="0" width="${f(w)}" height="${f(h)}" fill="#fff"/>` +
    `<text class="title" x="${f(w / 2)}" y="20" text-anchor="middle" ${FONT} font-size="14" font-weight="bold">${escapeXml(title)}</text>`
  );
}

function noData(w: number, h: number, title: string, aria: string | undefined): string {
  return (
    svgOpen(w, h, title, aria) +
    `<text class="nodata" x="${f(w / 2)}" y="${f(h / 2)}" text-anchor="middle" ${FONT} font-size="13" fill="#666">${NO_DATA}</text></svg>`
  );
}

/** 1,2,2.5,5 × 10^k の「きれいな」刻み幅 */
function niceStep(range: number, target = 5): number {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function ticks(min: number, max: number): number[] {
  const step = niceStep(max - min);
  const out: number[] = [];
  const start = Math.ceil(min / step - 1e-9);
  const end = Math.floor(max / step + 1e-9);
  for (let i = start; i <= end && out.length < 20; i++) out.push(Number((i * step).toFixed(6)));
  return out.length > 0 ? out : [min];
}

function autoRange(values: number[], yMin?: number, yMax?: number): [number, number] {
  let lo = isNum(yMin) ? yMin : Math.min(...values);
  let hi = isNum(yMax) ? yMax : Math.max(...values);
  if (!isNum(lo)) lo = 0;
  if (!isNum(hi)) hi = lo + 1;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) {
    const pad = Math.abs(lo) * 0.05 || 1;
    return [isNum(yMin) ? lo : lo - pad, isNum(yMax) ? hi : hi + pad];
  }
  const pad = (hi - lo) * 0.05;
  return [isNum(yMin) ? lo : lo - pad, isNum(yMax) ? hi : hi + pad];
}

export function renderLineChart(opts: LineChartOptions): string {
  const w = opts.width ?? 640;
  const h = opts.height ?? 360;
  const unit = opts.yUnit ?? "";
  const values = opts.series.flatMap((s) => s.points.map((p) => p.y).filter(isNum));
  if (values.length === 0) return noData(w, h, opts.title, opts.ariaLabel);

  const xs: string[] = [];
  const xIndex = new Map<string, number>();
  for (const s of opts.series) for (const p of s.points) if (!xIndex.has(p.x)) xIndex.set(p.x, xs.push(p.x) - 1);

  const legend = opts.series.length > 1;
  const m = { left: 56, right: 16, top: 32, bottom: legend ? 56 : 36 };
  const pw = Math.max(1, w - m.left - m.right);
  const ph = Math.max(1, h - m.top - m.bottom);
  const [lo, hi] = autoRange(values, opts.yMin, opts.yMax);
  const px = (i: number): number => (xs.length > 1 ? m.left + (i / (xs.length - 1)) * pw : m.left + pw / 2);
  const py = (v: number): number => m.top + ph - ((v - lo) / (hi - lo)) * ph;

  let out = svgOpen(w, h, opts.title, opts.ariaLabel);
  for (const t of ticks(lo, hi)) {
    const y = f(py(t));
    out += `<line class="grid" x1="${f(m.left)}" y1="${y}" x2="${f(m.left + pw)}" y2="${y}" stroke="#ddd"/>`;
    out += `<text class="ytick" x="${f(m.left - 6)}" y="${y}" text-anchor="end" dominant-baseline="middle" ${FONT} font-size="10" fill="#444">${f(t)}${escapeXml(unit)}</text>`;
  }
  out += `<line class="axis" x1="${f(m.left)}" y1="${f(m.top)}" x2="${f(m.left)}" y2="${f(m.top + ph)}" stroke="#333"/>`;
  out += `<line class="axis" x1="${f(m.left)}" y1="${f(m.top + ph)}" x2="${f(m.left + pw)}" y2="${f(m.top + ph)}" stroke="#333"/>`;
  const step = Math.max(1, Math.ceil(xs.length / 12));
  xs.forEach((label, i) => {
    if (i % step !== 0) return;
    out += `<text class="xlabel" x="${f(px(i))}" y="${f(m.top + ph + 14)}" text-anchor="middle" ${FONT} font-size="10" fill="#444">${escapeXml(label)}</text>`;
  });
  opts.series.forEach((s, si) => {
    const color = PALETTE[si % PALETTE.length] ?? "#000";
    let seg: string[] = [];
    const flush = (): void => {
      if (seg.length > 0)
        out += `<polyline class="series" fill="none" stroke="${color}" stroke-width="2" points="${seg.join(" ")}"/>`;
      seg = [];
    };
    for (const p of s.points) {
      if (!isNum(p.y)) {
        flush();
        continue;
      }
      seg.push(`${f(px(xIndex.get(p.x) ?? 0))},${f(py(p.y))}`);
    }
    flush();
    if (s.points.filter((p) => isNum(p.y)).length === 1) {
      const p = s.points.find((q) => isNum(q.y));
      if (p && isNum(p.y))
        out += `<circle class="point" cx="${f(px(xIndex.get(p.x) ?? 0))}" cy="${f(py(p.y))}" r="3" fill="${color}"/>`;
    }
  });
  if (legend) {
    const y = f(h - 10);
    const slot = pw / opts.series.length;
    opts.series.forEach((s, si) => {
      const x = m.left + si * slot;
      out += `<g class="legend"><line x1="${f(x)}" y1="${y}" x2="${f(x + 16)}" y2="${y}" stroke="${PALETTE[si % PALETTE.length] ?? "#000"}" stroke-width="2"/>`;
      out += `<text x="${f(x + 20)}" y="${y}" dominant-baseline="middle" ${FONT} font-size="10" fill="#444">${escapeXml(s.label)}</text></g>`;
    });
  }
  return out + "</svg>";
}

export function renderBarChart(opts: BarChartOptions): string {
  const horizontal = opts.horizontal ?? true;
  const items = opts.items.map((it) => ({ ...it, value: isNum(it.value) ? it.value : 0 }));
  const w = opts.width ?? 640;
  const rowH = 22;
  const h = opts.height ?? (horizontal ? items.length * rowH + 48 : 360);
  const unit = opts.unit ?? "";
  if (items.length === 0) return noData(w, h, opts.title, opts.ariaLabel);

  const lo = Math.min(0, ...items.map((i) => i.value));
  const hi = Math.max(0, ...items.map((i) => i.value));
  const span = hi - lo || 1;
  let out = svgOpen(w, h, opts.title, opts.ariaLabel);
  const cls = (it: BarItem): string => (it.highlight ? "bar highlight" : "bar");
  const fill = (it: BarItem): string => (it.highlight ? "#d62728" : "#1f77b4");

  if (horizontal) {
    const m = { left: 96, right: 64, top: 32 };
    const pw = Math.max(1, w - m.left - m.right);
    const sx = (v: number): number => m.left + ((v - lo) / span) * pw;
    const x0 = sx(0);
    items.forEach((it, i) => {
      const y = m.top + i * rowH;
      const xv = sx(it.value);
      const bx = Math.min(x0, xv);
      out += `<text class="label" x="${f(m.left - 6)}" y="${f(y + rowH / 2)}" text-anchor="end" dominant-baseline="middle" ${FONT} font-size="11" fill="#333">${escapeXml(it.label)}</text>`;
      out += `<rect class="${cls(it)}" x="${f(bx)}" y="${f(y + 3)}" width="${f(Math.abs(xv - x0))}" height="${f(rowH - 6)}" fill="${fill(it)}"/>`;
      out += `<text class="value" x="${f(Math.max(x0, xv) + 4)}" y="${f(y + rowH / 2)}" dominant-baseline="middle" ${FONT} font-size="10" fill="#333">${f(it.value)}${escapeXml(unit)}</text>`;
    });
    out += `<line class="axis" x1="${f(x0)}" y1="${f(m.top)}" x2="${f(x0)}" y2="${f(m.top + items.length * rowH)}" stroke="#333"/>`;
  } else {
    const m = { left: 16, right: 16, top: 40, bottom: 28 };
    const pw = Math.max(1, w - m.left - m.right);
    const ph = Math.max(1, h - m.top - m.bottom);
    const slot = pw / items.length;
    const bw = Math.max(1, slot * 0.7);
    const sy = (v: number): number => m.top + ph - ((v - lo) / span) * ph;
    const y0 = sy(0);
    items.forEach((it, i) => {
      const x = m.left + i * slot + (slot - bw) / 2;
      const yv = sy(it.value);
      out += `<rect class="${cls(it)}" x="${f(x)}" y="${f(Math.min(y0, yv))}" width="${f(bw)}" height="${f(Math.abs(yv - y0))}" fill="${fill(it)}"/>`;
      out += `<text class="value" x="${f(x + bw / 2)}" y="${f(Math.min(y0, yv) - 4)}" text-anchor="middle" ${FONT} font-size="10" fill="#333">${f(it.value)}${escapeXml(unit)}</text>`;
      out += `<text class="label" x="${f(x + bw / 2)}" y="${f(m.top + ph + 14)}" text-anchor="middle" ${FONT} font-size="10" fill="#333">${escapeXml(it.label)}</text>`;
    });
    out += `<line class="axis" x1="${f(m.left)}" y1="${f(y0)}" x2="${f(m.left + pw)}" y2="${f(y0)}" stroke="#333"/>`;
  }
  return out + "</svg>";
}
