// Renders static/og/default.png, the link preview for the bare site, so serving it
// costs the Worker nothing. Re-run if the brand card design changes.
//   node --experimental-strip-types --import ./scripts/lib/ts-resolve.mjs scripts/render-default-og.ts [host]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { buildBrandSvg, CARD_SIZE } from '../src/lib/share/card.ts';

const host = process.argv[2] ?? 'compare-cities.hacer.workers.dev';
await initWasm(readFileSync(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm')));
const font = (f: string) => readFileSync(new URL(`../static/fonts/${f}`, import.meta.url));
const png = new Resvg(buildBrandSvg(host), {
	fitTo: { mode: 'width', value: CARD_SIZE.landscape[0] },
	font: { fontBuffers: [font('bricolage-500.ttf'), font('bricolage-800.ttf'), font('unbounded-700.ttf')], loadSystemFonts: false }
})
	.render()
	.asPng();
mkdirSync(new URL('../static/og/', import.meta.url), { recursive: true });
writeFileSync(new URL('../static/og/default.png', import.meta.url), png);
console.log(`static/og/default.png (${host}), ${png.length} bytes`);
