// Copies MapLibre's web worker into public/ so the map can load it.
// Bundlers rewrite `import.meta.url`, which breaks MapLibre's own lookup of
// its worker; MapView points it here with setWorkerUrl(). The folder is
// versioned so browsers never mix a cached worker with a newer library.
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const dist = join(dirname(pkgPath), "dist");
const outRoot = join(root, "public", "maplibre");
const out = join(outRoot, version);

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  cpSync(join(dist, file), join(out, file));
}
console.log(`maplibre worker ${version} -> public/maplibre/${version}`);
