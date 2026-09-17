/**
 * 正規化ストア。data/normalized/<metric>.json の読み書きと、
 * Dataset に対する基本的な参照・マージ操作をまとめる。
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Dataset, MetricId, Observation, RegionCode, Store } from "./types.js";

const obsKey = (o: Observation): string => `${o.region}:${o.period}`;

const compareObs = (a: Observation, b: Observation): number =>
  a.region < b.region ? -1 : a.region > b.region ? 1 : a.period < b.period ? -1 : a.period > b.period ? 1 : 0;

export function sortObservations(observations: Observation[]): Observation[] {
  return [...observations].sort(compareObs);
}

/** (region, period) をキーに incoming で上書きマージし、region → period 昇順に整列する。メタデータは incoming を採用 */
export function mergeDataset(existing: Dataset | undefined, incoming: Dataset): Dataset {
  const byKey = new Map<string, Observation>();
  for (const o of existing?.observations ?? []) byKey.set(obsKey(o), o);
  for (const o of incoming.observations) byKey.set(obsKey(o), o);
  return { ...incoming, observations: sortObservations([...byKey.values()]) };
}

export function latestPeriod(ds: Dataset): string | undefined {
  let max: string | undefined;
  for (const o of ds.observations) if (max === undefined || o.period > max) max = o.period;
  return max;
}

/** 指定地域の系列(period 昇順) */
export function seriesFor(ds: Dataset, region: RegionCode): { period: string; value: number }[] {
  return ds.observations
    .filter((o) => o.region === region)
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))
    .map((o) => ({ period: o.period, value: o.value }));
}

export function valueAt(ds: Dataset, region: RegionCode, period: string): number | undefined {
  return ds.observations.find((o) => o.region === region && o.period === period)?.value;
}

/** 指定期間に値を持つ地域(コード昇順、重複なし) */
export function regionsAt(ds: Dataset, period: string): RegionCode[] {
  const set = new Set<RegionCode>();
  for (const o of ds.observations) if (o.period === period) set.add(o.region);
  return [...set].sort();
}

const fileName = (metric: MetricId): string => `${metric}.json`;

/** dir 直下の <metric>.json をすべて読む。dir が無ければ空 Store */
export async function readStore(dir: string): Promise<Store> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { datasets: {} };
    throw err;
  }
  const store: Store = { datasets: {} };
  for (const name of entries.sort()) {
    if (!name.endsWith(".json")) continue;
    const ds = JSON.parse(await readFile(join(dir, name), "utf8")) as Dataset;
    if (fileName(ds.metric) !== name) throw new Error(`metric mismatch: ${name} contains ${ds.metric}`);
    store.datasets[ds.metric] = ds;
  }
  return store;
}

/** mkdir -p のうえ、各 Dataset を整形 JSON(observations 昇順)で書く */
export async function writeStore(dir: string, store: Store): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const ds of Object.values(store.datasets)) {
    if (!ds) continue;
    const canon: Dataset = { ...ds, observations: sortObservations(ds.observations) };
    await writeFile(join(dir, fileName(ds.metric)), JSON.stringify(canon, null, 2) + "\n", "utf8");
  }
}

/** 全 Dataset の正準 JSON(metric 名順・observations 昇順)の SHA-256。変更検知用 */
export function storeDigest(store: Store): string {
  const metrics = (Object.keys(store.datasets) as MetricId[]).sort();
  const canon = metrics.flatMap((m) => {
    const ds = store.datasets[m];
    return ds ? [{ ...ds, observations: sortObservations(ds.observations) }] : [];
  });
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}
