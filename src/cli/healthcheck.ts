/**
 * 日次ヘルスチェック: 公開 URL・出典 URL・有効なアフィリエイト URL が生きているか。
 * CI が緑でも公開物が壊れていることはあるので、公開後の実物を確認する。
 */
import { headOk } from "../sources/http.js";
import { DASHBOARD_SOURCE } from "../sources/dashboard.js";
import { readStore } from "../normalize/store.js";
import { defaultPaths, loadConfigs } from "./lib.js";

export async function healthTargets(): Promise<string[]> {
  const paths = defaultPaths();
  const { site, monetization } = await loadConfigs(paths);
  const store = await readStore(paths.dataDir);
  const urls = new Set<string>([site.baseUrl.replace(/\/?$/, "/"), `${site.baseUrl.replace(/\/?$/, "")}/sitemap.xml`, DASHBOARD_SOURCE.termsUrl]);
  for (const ds of Object.values(store.datasets)) if (ds) urls.add(ds.sourceUrl);
  for (const p of monetization.programs) if (p.status === "active" && p.url) urls.add(p.url);
  return [...urls];
}

const targets = await healthTargets();
let failed = 0;
for (const url of targets) {
  const r = await headOk(url);
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.status} ${url}`);
  if (!r.ok) failed++;
}
console.log(failed === 0 ? "[healthcheck] all targets healthy" : `[healthcheck] ${failed} target(s) unhealthy`);
process.exit(failed === 0 ? 0 : 1);
