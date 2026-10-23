// Build-time land clipping: the shared clipper (src/lib/land.ts) with tiles cached
// on disk, so each tile is downloaded only once across all cache runs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clipToLand as clip, tileUrl } from '../../src/lib/land.ts';
import type { Area } from '../../src/lib/types.ts';

const CACHE = new URL('../.tilecache/', import.meta.url);
const UA = { headers: { 'User-Agent': 'CompareCities/1.0 (+https://github.com/camilou/compare-cities; land clipping)' } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tile(z: number, x: number, y: number): Promise<Uint8Array> {
	mkdirSync(CACHE, { recursive: true });
	const file = new URL(`${z}-${x}-${y}.pbf`, CACHE);
	if (existsSync(file)) return readFileSync(file);
	const url = (await tileUrl(UA)).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
	for (let attempt = 0; attempt < 4; attempt++) {
		const res = await fetch(url, UA).catch(() => undefined);
		if (res?.ok) {
			const buf = new Uint8Array(await res.arrayBuffer());
			writeFileSync(file, buf);
			await wait(50); // gentle, even on a CDN
			return buf;
		}
		if (res?.status === 204 || res?.status === 404) return new Uint8Array();
		await wait(2000 * (attempt + 1));
	}
	throw new Error(`tile ${z}/${x}/${y} failed`);
}

export const clipToLand = (g: Area) => clip(g, tile);
