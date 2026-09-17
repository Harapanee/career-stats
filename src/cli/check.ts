import { readStore } from "../normalize/store.js";
import { defaultPaths, loadConfigs, runBuild, runCheck, todayStr } from "./lib.js";

const offline = process.argv.includes("--offline");
const paths = defaultPaths();
const { site, monetization } = await loadConfigs(paths);
const store = await readStore(paths.dataDir);
const today = todayStr();
const pages = await runBuild({ paths, store, site, monetization, today });
const report = await runCheck({ store, pages, site, monetization, today, offline });
console.log(report.toText());
process.exit(report.ok ? 0 : 1);
