/** Gera dist/public: copia a pasta public/ e empacota o TypeScript do navegador (app.js) e o service worker (sw.js). */
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const out = "dist/public";
rmSync("dist", { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync("public", out, { recursive: true });

const common = { bundle: true, format: "esm", target: ["safari15", "chrome100", "firefox100"], minify: true, legalComments: "none", logLevel: "info" } as const;
const buildId = Date.now().toString(36);

await build({ ...common, entryPoints: ["src/web/main.ts"], outfile: `${out}/app.js` });
await build({ ...common, entryPoints: ["src/web/sw.ts"], outfile: `${out}/sw.js`, define: { BUILD_ID: JSON.stringify(buildId) } });
