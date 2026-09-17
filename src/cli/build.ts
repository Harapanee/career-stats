import { readStore } from "../normalize/store.js";
import { defaultPaths, loadConfigs, runBuild, todayStr } from "./lib.js";

const paths = defaultPaths();
const { site, monetization } = await loadConfigs(paths);
const store = await readStore(paths.dataDir);
const pages = await runBuild({ paths, store, site, monetization, today: todayStr() });
console.log(`[build] ${pages.length} pages → ${paths.siteDir}`);
