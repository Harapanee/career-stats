/**
 * ページビルダー。Store と設定から全ページ(BuiltPage[])を決定的に生成する。
 * ページ種別: トップ / 都道府県一覧 / 都道府県 / 指標一覧 / 指標 / 固定ページ / 404。
 */
import type { MetricId, RegionCode, Store, Dataset } from "../normalize/types.js";
import { PREFECTURES } from "../normalize/types.js";
import { latestPeriod, seriesFor, valueAt } from "../normalize/store.js";
import { derive, rankTable, type DerivedStats } from "../normalize/derive.js";
import type { Monetization } from "../monetize/types.js";
import { selectPrograms, renderCta } from "../monetize/cta.js";
import { renderPage, type SiteConfig, type SourceRef, type PageSpec } from "./page.js";
import { renderLineChart, renderBarChart, escapeXml, formatNumber } from "./svg.js";
import { joinUrl } from "./sitemap.js";
import { summarySentences, periodLabel, signed } from "./text.js";
import { staticPages } from "./static-pages.js";
import type { BuiltPage } from "./types.js";

export interface BuildInput {
  site: SiteConfig;
  monetization: Monetization;
  store: Store;
  /** YYYY-MM-DD */
  today: string;
}

export const METRIC_INFO: Record<MetricId, { slug: string; name: string; unit: string; origin: string; note: string }> = {
  active_openings_ratio: {
    slug: "active-openings-ratio",
    name: "有効求人倍率",
    unit: "倍",
    origin: "『一般職業紹介状況』(厚生労働省)",
    note: "ハローワークにおける有効求人数を有効求職者数で割った値(季節調整値)。1 倍を超えると求職者 1 人あたりの求人が 1 件を上回ります。",
  },
  new_openings_ratio: {
    slug: "new-openings-ratio",
    name: "新規求人倍率",
    unit: "倍",
    origin: "『一般職業紹介状況』(厚生労働省)",
    note: "その月に新たに受け付けた求人数を新規求職者数で割った値(季節調整値)。有効求人倍率より先に景気の変化が現れやすい指標です。",
  },
  unemployment_rate: {
    slug: "unemployment-rate",
    name: "完全失業率",
    unit: "%",
    origin: "『労働力調査』(総務省統計局)",
    note: "労働力人口に占める完全失業者の割合(季節調整値)。全国値のみ月次で公表されています。",
  },
  job_changers: { slug: "job-changers", name: "転職者数", unit: "万人", origin: "『労働力調査』(総務省統計局)", note: "転職者数(年次)。" },
};

const NEW_GRAD_CONTEXT = "new-graduate";

function prefName(code: RegionCode): string {
  return PREFECTURES.find((p) => p.code === code)?.name ?? code;
}

function sourceRefs(store: Store, metrics: MetricId[]): SourceRef[] {
  const refs: SourceRef[] = [];
  for (const m of metrics) {
    const ds = store.datasets[m];
    if (ds && !refs.some((r) => r.url === ds.sourceUrl)) refs.push({ name: ds.sourceName, url: ds.sourceUrl, termsUrl: ds.termsUrl });
  }
  return refs;
}

/** 図表キャプション(L6/L9): 出典・時点・並べ替え基準・加工主体 */
export function caption(ds: Dataset, info: { origin: string }, operator: string, extra?: string): string {
  const fetched = ds.fetchedAt.slice(0, 10);
  const parts = [`出典: ${info.origin}、統計ダッシュボード(https://dashboard.e-stat.go.jp/)のデータを ${operator} が加工して作成(${fetched} 取得)`];
  if (extra) parts.push(extra);
  return `<p class="caption">${escapeXml(parts.join("。"))}。</p>`;
}

function derivedTable(d: DerivedStats, unit: string): string {
  const row = (k: string, v: string) => `<tr><th scope="row">${escapeXml(k)}</th><td>${escapeXml(v)}</td></tr>`;
  const u = unit;
  const rows = [
    row(`${periodLabel(d.period)}の値`, `${formatNumber(d.value)}${u}`),
    row("前月差", d.momDiff === null ? "—" : `${signed(d.momDiff)}${u}`),
    row("前年同月差", d.yoyDiff === null ? "—" : `${signed(d.yoyDiff)}${u}`),
  ];
  if (d.rank !== null) rows.push(row("全国順位", `${d.rank} 位 / ${d.rankOf} 都道府県`));
  if (d.nationalDiff !== null) rows.push(row("全国値との差", `${signed(d.nationalDiff)}${u}`));
  rows.push(row("過去最高(集計期間内)", `${formatNumber(d.maxInSeries.value)}${u}(${periodLabel(d.maxInSeries.period)})`));
  rows.push(row("過去最低(集計期間内)", `${formatNumber(d.minInSeries.value)}${u}(${periodLabel(d.minInSeries.period)})`));
  return `<table class="derived"><caption>主な派生値</caption><tbody>${rows.join("")}</tbody></table>`;
}

function sentencesHtml(s: string[]): string {
  return `<p class="summary">${s.map(escapeXml).join("")}</p>`;
}

function lineChartFor(ds: Dataset, region: RegionCode, title: string, unit: string, withNational: boolean): string {
  const series = [{ label: region === "JP" ? "全国" : prefName(region), points: seriesFor(ds, region).map((p) => ({ x: p.period, y: p.value })) }];
  if (withNational && region !== "JP") series.push({ label: "全国", points: seriesFor(ds, "JP").map((p) => ({ x: p.period, y: p.value })) });
  return renderLineChart({ title, series, yUnit: unit, width: 800, height: 360 });
}

function crumbs(...items: { name: string; path: string }[]) {
  return [{ name: "トップ", path: "/" }, ...items];
}

export function buildAllPages(input: BuildInput): BuiltPage[] {
  const { site, monetization, store, today } = input;
  const op = site.operator.name;
  const pages: BuiltPage[] = [];
  const active = store.datasets.active_openings_ratio;
  if (!active) throw new Error("active_openings_ratio dataset is required");
  const latest = latestPeriod(active);
  if (!latest) throw new Error("active_openings_ratio has no observations");
  const aInfo = METRIC_INFO.active_openings_ratio;
  const ranks = rankTable(active, latest);

  const push = (spec: Omit<PageSpec, "disclosure">, isDataPage: boolean) => {
    const html = renderPage(site, { ...spec, disclosure: monetization.disclosure });
    pages.push({ path: spec.path, html, lastmod: today, hasAffiliate: spec.hasAffiliate, isDataPage });
  };
  const href = (p: string) => escapeXml(joinUrl(site.baseUrl, p));

  // ---- 都道府県ページ
  for (const pref of PREFECTURES) {
    const d = derive(active, pref.code, latest);
    const sentences = summarySentences(d, { region: pref.name, metric: aInfo.name, unit: aInfo.unit });
    const programs = selectPrograms(monetization, { context: NEW_GRAD_CONTEXT, region: pref.code });
    const cta = renderCta(programs);
    const neighbors = ranks.filter((r) => r.region !== pref.code && Math.abs(r.rank - (d.rank ?? 0)) <= 2).slice(0, 4);
    const newDs = store.datasets.new_openings_ratio;
    let newSection = "";
    if (newDs && valueAt(newDs, pref.code, latest) !== undefined) {
      const nd = derive(newDs, pref.code, latest);
      const nInfo = METRIC_INFO.new_openings_ratio;
      newSection = [
        `<h2>${escapeXml(pref.name)}の${nInfo.name}</h2>`,
        sentencesHtml(summarySentences(nd, { region: pref.name, metric: nInfo.name, unit: nInfo.unit })),
        derivedTable(nd, nInfo.unit),
        lineChartFor(newDs, pref.code, `${pref.name}の${nInfo.name}(季節調整値)の推移`, nInfo.unit, true),
        caption(newDs, nInfo, op),
      ].join("\n");
    }
    const body = [
      `<h2>${escapeXml(pref.name)}の${aInfo.name}(${escapeXml(periodLabel(latest))})</h2>`,
      sentencesHtml(sentences),
      derivedTable(d, aInfo.unit),
      lineChartFor(active, pref.code, `${pref.name}の${aInfo.name}(季節調整値)の推移`, aInfo.unit, true),
      caption(active, aInfo, op, "折れ線は季節調整値。全国値は比較用"),
      `<h2>全国順位が近い都道府県</h2>`,
      `<ul>${neighbors.map((n) => `<li><a href="${href(`/pref/${PREFECTURES.find((p) => p.code === n.region)?.slug}/`)}">${escapeXml(prefName(n.region))}</a>(${n.rank} 位、${formatNumber(n.value)}${aInfo.unit})</li>`).join("")}</ul>`,
      `<p><a href="${href("/pref/")}">47 都道府県の一覧に戻る</a></p>`,
      newSection,
      `<h2>この指標について</h2><p>${escapeXml(aInfo.note)}</p>`,
      cta,
    ].join("\n");
    push(
      {
        title: `${pref.name}の有効求人倍率(${periodLabel(latest)})と推移`,
        description: `${periodLabel(latest)}の${pref.name}の有効求人倍率は${formatNumber(d.value)}倍(前月差${d.momDiff === null ? "—" : signed(d.momDiff)}、全国${d.rank ?? "-"}位)。2015年以降の推移を公的統計から自動集計。`,
        path: `/pref/${pref.slug}/`,
        bodyHtml: body,
        hasAffiliate: programs.length > 0,
        sources: sourceRefs(store, ["active_openings_ratio", "new_openings_ratio"]),
        breadcrumbs: crumbs({ name: "都道府県", path: "/pref/" }, { name: pref.name, path: `/pref/${pref.slug}/` }),
        updatedAt: today,
      },
      true,
    );
  }

  // ---- 都道府県一覧
  const bar = renderBarChart({
    title: `都道府県別 ${aInfo.name}(${periodLabel(latest)}、季節調整値)`,
    items: ranks.map((r) => ({ label: prefName(r.region), value: r.value })),
    unit: aInfo.unit,
    width: 800,
  });
  const rankRows = ranks
    .map((r) => {
      const p = PREFECTURES.find((x) => x.code === r.region)!;
      const dd = derive(active, r.region, latest);
      return `<tr><td>${r.rank}</td><td><a href="${href(`/pref/${p.slug}/`)}">${escapeXml(p.name)}</a></td><td>${formatNumber(r.value)}</td><td>${dd.momDiff === null ? "—" : signed(dd.momDiff)}</td><td>${dd.yoyDiff === null ? "—" : signed(dd.yoyDiff)}</td></tr>`;
    })
    .join("");
  push(
    {
      title: `都道府県別 有効求人倍率 一覧(${periodLabel(latest)})`,
      description: `${periodLabel(latest)}の有効求人倍率(季節調整値)を 47 都道府県で比較。順位・前月差・前年同月差を一覧表示。`,
      path: "/pref/",
      bodyHtml: [
        `<p>全国値は ${formatNumber(valueAt(active, "JP", latest) ?? 0)} 倍です。並べ替え基準: ${escapeXml(periodLabel(latest))}の季節調整値の高い順。</p>`,
        bar,
        caption(active, aInfo, op, `並べ替え基準は${periodLabel(latest)}の季節調整値の高い順`),
        `<table><caption>都道府県別 ${aInfo.name}(${escapeXml(periodLabel(latest))})</caption><thead><tr><th>順位</th><th>都道府県</th><th>${aInfo.name}(倍)</th><th>前月差</th><th>前年同月差</th></tr></thead><tbody>${rankRows}</tbody></table>`,
      ].join("\n"),
      hasAffiliate: false,
      sources: sourceRefs(store, ["active_openings_ratio"]),
      breadcrumbs: crumbs({ name: "都道府県", path: "/pref/" }),
      updatedAt: today,
    },
    false,
  );

  // ---- 指標ページ
  const metricIds = (Object.keys(store.datasets) as MetricId[]).filter((m) => store.datasets[m]);
  for (const m of metricIds) {
    const ds = store.datasets[m]!;
    const info = METRIC_INFO[m];
    const lp = latestPeriod(ds);
    if (!lp) continue;
    const d = derive(ds, "JP", lp);
    push(
      {
        title: `${info.name}の推移(全国、${periodLabel(lp)}時点)`,
        description: `${periodLabel(lp)}の全国の${info.name}は${formatNumber(d.value)}${info.unit}。2015年以降の月次推移と前月差・前年同月差を公的統計から自動集計。`,
        path: `/metrics/${info.slug}/`,
        bodyHtml: [
          sentencesHtml(summarySentences(d, { region: "全国", metric: info.name, unit: info.unit })),
          derivedTable(d, info.unit),
          lineChartFor(ds, "JP", `全国の${info.name}(季節調整値)の推移`, info.unit, false),
          caption(ds, info, op),
          `<h2>この指標について</h2><p>${escapeXml(info.note)}</p>`,
          m === "active_openings_ratio" ? `<p><a href="${href("/pref/")}">都道府県別の一覧を見る</a></p>` : "",
        ].join("\n"),
        hasAffiliate: false,
        sources: sourceRefs(store, [m]),
        breadcrumbs: crumbs({ name: "指標", path: "/metrics/" }, { name: info.name, path: `/metrics/${info.slug}/` }),
        updatedAt: today,
      },
      true,
    );
  }
  push(
    {
      title: "指標一覧",
      description: "当サイトで公開している就職・転職関連の公的統計指標の一覧。",
      path: "/metrics/",
      bodyHtml: `<ul>${metricIds
        .map((m) => {
          const info = METRIC_INFO[m];
          const ds = store.datasets[m]!;
          const lp = latestPeriod(ds)!;
          return `<li><a href="${href(`/metrics/${info.slug}/`)}">${info.name}</a>: ${formatNumber(valueAt(ds, "JP", lp) ?? 0)}${info.unit}(${escapeXml(periodLabel(lp))})</li>`;
        })
        .join("")}</ul>`,
      hasAffiliate: false,
      sources: sourceRefs(store, metricIds),
      breadcrumbs: crumbs({ name: "指標", path: "/metrics/" }),
      updatedAt: today,
    },
    false,
  );

  // ---- トップ
  const jp = derive(active, "JP", latest);
  const top5 = ranks.slice(0, 5);
  const bottom5 = ranks.slice(-5).reverse();
  const li = (r: { region: RegionCode; value: number; rank: number }) =>
    `<li><a href="${href(`/pref/${PREFECTURES.find((p) => p.code === r.region)?.slug}/`)}">${escapeXml(prefName(r.region))}</a> ${formatNumber(r.value)}倍(${r.rank} 位)</li>`;
  push(
    {
      title: `就職・転職の公的統計ダッシュボード(${periodLabel(latest)}時点)`,
      description: `有効求人倍率・新規求人倍率・完全失業率を都道府県別・時系列で自動集計。${periodLabel(latest)}の全国の有効求人倍率は${formatNumber(jp.value)}倍。`,
      path: "/",
      bodyHtml: [
        sentencesHtml(summarySentences(jp, { region: "全国", metric: aInfo.name, unit: aInfo.unit })),
        `<ul class="tiles">${metricIds
          .map((m) => {
            const info = METRIC_INFO[m];
            const ds = store.datasets[m]!;
            const lp = latestPeriod(ds)!;
            return `<li><a href="${href(`/metrics/${info.slug}/`)}">${info.name}</a><strong>${formatNumber(valueAt(ds, "JP", lp) ?? 0)}${info.unit}</strong><span>${escapeXml(periodLabel(lp))}</span></li>`;
          })
          .join("")}</ul>`,
        lineChartFor(active, "JP", `全国の${aInfo.name}(季節調整値)の推移`, aInfo.unit, false),
        caption(active, aInfo, op),
        `<h2>${escapeXml(periodLabel(latest))}の有効求人倍率が高い都道府県</h2><ol>${top5.map(li).join("")}</ol>`,
        `<h2>低い都道府県</h2><ol>${bottom5.map(li).join("")}</ol>`,
        `<p><a href="${href("/pref/")}">47 都道府県の一覧</a> / <a href="${href("/metrics/")}">指標一覧</a> / <a href="${href("/about/")}">このサイトについて</a></p>`,
      ].join("\n"),
      hasAffiliate: false,
      sources: sourceRefs(store, metricIds),
      breadcrumbs: crumbs(),
      updatedAt: today,
    },
    false,
  );

  // ---- 固定ページ・404
  for (const sp of staticPages(site)) {
    push({ ...sp, hasAffiliate: false, sources: [], breadcrumbs: crumbs({ name: sp.title, path: sp.path }), updatedAt: today }, false);
  }
  push(
    {
      title: "ページが見つかりません",
      description: "お探しのページは存在しないか、移動しました。",
      path: "/404.html",
      bodyHtml: `<p>お探しのページは見つかりませんでした。<a href="${href("/")}">トップページ</a>からお探しください。</p>`,
      hasAffiliate: false,
      sources: [],
      breadcrumbs: crumbs(),
      updatedAt: today,
      noindex: true,
    },
    false,
  );

  if (pages.length > site.maxPages) throw new Error(`page count ${pages.length} exceeds maxPages ${site.maxPages}`);
  return pages;
}
