import { defaultPaths, runCycle } from "./lib.js";

const offline = process.argv.includes("--offline");
const code = await runCycle({ paths: defaultPaths(), offline });
process.exit(code);
