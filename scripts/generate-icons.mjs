// Generates PNG PWA / iOS icons from the SVG sources in public/icons.
//
// Usage (from the repo root):
//   node scripts/generate-icons.mjs
//
// Outputs (written to public/icons):
//   icon-192.png           192x192, purpose "any"
//   icon-512.png           512x512, purpose "any"
//   icon-maskable-512.png  512x512, purpose "maskable" (emblem inside the 80%
//                          safe zone on a full-bleed background)
//   apple-touch-icon.png   180x180, opaque (iOS ignores transparency and
//                          applies its own rounded mask)
//
// Requires `sharp` (installed transitively by Next.js). Re-run whenever the
// SVG artwork changes and commit the resulting PNGs.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = path.join(root, "public", "icons");

// Matches the <rect> fill in the SVGs and the manifest background_color.
const BACKGROUND = "#0A0A0A";

const svg192 = await readFile(path.join(iconsDir, "icon-192.svg"));
const svg512 = await readFile(path.join(iconsDir, "icon-512.svg"));

// The source SVG's rounded-rect frame looks wrong once the platform applies
// its own mask (a visible inner border, clipped stroke), so the full-bleed
// variants drop it and keep only the emblem. The emblem spans ~56% of the
// viewBox, so it sits well inside the maskable safe zone (central circle,
// 80% diameter) and inside iOS's rounded-corner mask.
const emblem512 = Buffer.from(
  svg512.toString("utf8").replace(/<rect\b[^>]*\/>/, ""),
);

// Render an SVG at a given size with high density so edges stay crisp.
function render(svg, size) {
  return sharp(svg, { density: 384 }).resize(size, size);
}

// Fully opaque render: transparent areas filled with the icon background and
// the alpha channel removed.
function opaque(svg, size) {
  return render(svg, size).flatten({ background: BACKGROUND });
}

const outputs = [
  ["icon-192.png", render(svg192, 192)],
  ["icon-512.png", render(svg512, 512)],
  ["icon-maskable-512.png", opaque(emblem512, 512)],
  ["apple-touch-icon.png", opaque(emblem512, 180)],
];

for (const [name, pipeline] of outputs) {
  const file = path.join(iconsDir, name);
  await pipeline.png().toFile(file);
  console.log(`wrote ${path.relative(root, file)}`);
}
