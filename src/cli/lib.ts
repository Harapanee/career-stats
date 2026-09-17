/**
 * CLI 共通: 設定読込・パス・collect/build/check の実体。
 * 各 CLI(collect/build/check/cycle/healthcheck)はこの関数を呼ぶだけの薄いラッパ。
 */
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Store } from "../normalize/types.js";
import { mergeDataset, readStore, writeStore, storeDigest } from "../normalize/store.js";
import { collectAll, DASHBOARD_SOURCE } from "../sources/dashboard.js";
import type { FetchLike } from "../sources/http.js";
import { loadMonetization } from "../monetize/cta.js";
import type { Monetization } from "../monetize/types.js";
import type { SiteConfig } from "../render/page.js";
import { buildAllPages } from "../render/pages.js";
import { renderSitemap, renderRobots } from "../render/sitemap.js";
import type { BuiltPage } from "../render/types.js";
import { runGates, type GateReport } from "../gates/run.js";
import { dataGate } from "../gates/data.js";
import { sourceLivenessGate } from "../gates/liveness.js";
import { legalTextGate } from "../gates/legal.js";
import { affiliateGate } from "../gates/affiliate.js";
import { qualityGate } from "../gates/quality.js";
import { stalenessGate } from "../gates/staleness.js";

export interface Paths {
  root: string;
  siteConfig: string;
  monetizationConfig: string;
  dataDir: string;
  siteDir: string;
}

export function defaultPaths(root = process.cwd()): Paths {
  return {
    root,
    siteConfig: path.join(root, "config/site.json"),
    monetizationConfig: path.join(root, "config/monetization.json"),
    dataDir: path.join(root, "data/normalized"),
    siteDir: path.join(root, "site"),
  };
}

export async function loadSite(p: string): Promise<SiteConfig> {
  return JSON.parse(await readFile(p, "utf8")) as SiteConfig;
}

/** JST(UTC+9)の日付。Actions は UTC で動くので明示的にずらす */
export function todayStr(now: () => Date = () => new Date()): string {
  return new Date(now().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** collect: 取得 → 既存ストアにマージ → 書き込み。戻り値は変更有無。 */
export async function runCollect(opts: { paths: Paths; fetch?: FetchLike; now?: () => Date; timeFrom?: string }): Promise<{ store: Store; changed: boolean }> {
  const before = await readStore(opts.paths.dataDir);
  const incoming = await collectAll({ fetch: opts.fetch, now: opts.now, timeFrom: opts.timeFrom });
  const store: Store = { datasets: { ...before.datasets } };
  for (const ds of incoming) store.datasets[ds.metric] = mergeDataset(before.datasets[ds.metric], ds);
  const changed = storeDigest(before) !== storeDigest(store);
  await writeStore(opts.paths.dataDir, store);
  return { store, changed };
}

/** build: ページ生成 → site/ へ書き出し(既存は消す)。 */
export async function runBuild(opts: { paths: Paths; store: Store; site: SiteConfig; monetization: Monetization; today: string }): Promise<BuiltPage[]> {
  const pages = buildAllPages({ site: opts.site, monetization: opts.monetization, store: opts.store, today: opts.today });
  const dir = opts.paths.siteDir;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const p of pages) {
    const file = p.path.endsWith("/") ? path.join(dir, p.path, "index.html") : path.join(dir, p.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, p.html, "utf8");
  }
  const entries = pages.filter((p) => !p.html.includes('name="robots" content="noindex"')).map((p) => ({ path: p.path, lastmod: p.lastmod }));
  await writeFile(path.join(dir, "sitemap.xml"), renderSitemap(opts.site.baseUrl, entries), "utf8");
  await writeFile(path.join(dir, "robots.txt"), renderRobots(opts.site.baseUrl), "utf8");
  await writeFile(path.join(dir, ".nojekyll"), "", "utf8");
  return pages;
}

/** check: 全ゲートを実行。offline のときはネットワークを使うゲート(G2/G4 の死活)を省く。 */
export async function runCheck(opts: {
  store: Store;
  pages: BuiltPage[];
  site: SiteConfig;
  monetization: Monetization;
  today: string;
  fetch?: FetchLike;
  offline?: boolean;
}): Promise<GateReport> {
  const sourceUrls = new Set<string>([DASHBOARD_SOURCE.termsUrl]);
  for (const ds of Object.values(opts.store.datasets)) if (ds) sourceUrls.add(ds.sourceUrl);
  const gates = [
    dataGate(opts.store),
    ...(opts.offline ? [] : [sourceLivenessGate([...sourceUrls], { fetch: opts.fetch })]),
    legalTextGate(opts.pages, opts.monetization),
    affiliateGate(opts.pages, opts.monetization, { fetch: opts.fetch, checkLiveness: !opts.offline }),
    qualityGate(opts.pages, { maxPages: opts.site.maxPages, baseUrl: opts.site.baseUrl, contactEmail: opts.site.operator.contactEmail }),
    stalenessGate(opts.store, opts.today),
  ];
  return runGates(gates);
}

export async function loadConfigs(paths: Paths): Promise<{ site: SiteConfig; monetization: Monetization }> {
  return { site: await loadSite(paths.siteConfig), monetization: await loadMonetization(paths.monetizationConfig) };
}

/** cycle: collect → build → check。check FAIL なら site/ を消して 1 を返す。 */
export async function runCycle(opts: { paths: Paths; fetch?: FetchLike; now?: () => Date; offline?: boolean; log?: (s: string) => void }): Promise<number> {
  const log = opts.log ?? ((s: string) => console.log(s));
  try {
    return await cycleInner({ ...opts, log });
  } catch (e) {
    await rm(opts.paths.siteDir, { recursive: true, force: true });
    log(`[cycle] ERROR ${e instanceof Error ? e.message : String(e)} — site/ を削除しました(公開しません)`);
    return 1;
  }
}

async function cycleInner(opts: { paths: Paths; fetch?: FetchLike; now?: () => Date; offline?: boolean; log: (s: string) => void }): Promise<number> {
  const log = opts.log;
  const { site, monetization } = await loadConfigs(opts.paths);
  const today = todayStr(opts.now);
  const { store, changed } = await runCollect({ paths: opts.paths, fetch: opts.fetch, now: opts.now });
  log(`[collect] datasets=${Object.keys(store.datasets).length} changed=${changed}`);
  const pages = await runBuild({ paths: opts.paths, store, site, monetization, today });
  log(`[build] pages=${pages.length} → ${opts.paths.siteDir}`);
  const report = await runCheck({ store, pages, site, monetization, today, fetch: opts.fetch, offline: opts.offline });
  log(report.toText());
  if (!report.ok) {
    await rm(opts.paths.siteDir, { recursive: true, force: true });
    log(`[check] FAIL — site/ を削除しました(公開しません)`);
    return 1;
  }
  log(`[check] PASS — 公開可能`);
  return 0;
}
