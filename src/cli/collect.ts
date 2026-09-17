import { defaultPaths, runCollect } from "./lib.js";

const { store, changed } = await runCollect({ paths: defaultPaths() });
for (const ds of Object.values(store.datasets)) {
  if (ds) console.log(`[collect] ${ds.metric}: ${ds.observations.length} obs, latest ${ds.observations.at(-1)?.period}`);
}
console.log(`[collect] changed=${changed}`);
