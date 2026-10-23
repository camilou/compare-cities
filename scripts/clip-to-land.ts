// Clips every cached city to land (see scripts/lib/land.ts). Resumable: files
// already marked `land: true` are skipped. Optionally pass ids to clip just those.
//
//   node --experimental-strip-types scripts/clip-to-land.ts [R111968 R175905 ...]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clipToLand } from './lib/land.ts';
import { areaKm2, mainland, simplifyTo } from '../src/lib/geo.ts';
import type { City } from '../src/lib/types.ts';

const DIR = new URL('../static/cities/', import.meta.url);
const only = new Set(process.argv.slice(2));

let clipped = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
	if (only.size && !only.has(f.slice(0, -5))) continue;
	const file = new URL(f, DIR);
	const city = JSON.parse(readFileSync(file, 'utf8')) as City & { land?: boolean };
	if (city.land && !only.size) continue;
	try {
		const before = areaKm2(mainland(city.geometry, city.center));
		const clip = await clipToLand(city.geometry);
		const geometry = simplifyTo(clip.geometry, 3000); // tile coastlines are dense; cap stored points
		const touched = clip.touched;
		const after = areaKm2(mainland(geometry, city.center));
		// Re-read and patch, so parallel robots writing other fields aren't overwritten.
		const latest = JSON.parse(readFileSync(file, 'utf8')) as City & { land?: boolean };
		const next: City & { land?: boolean } = { ...latest, land: true };
		if (touched && after < before * 0.995) {
			next.geometry = geometry;
			delete next.green; // park share was measured against the old (wet) outline
			clipped++;
			console.log(`${city.name}: ${Math.round(before)} → ${Math.round(after)} km² (−${Math.round(before - after)} km² of sea)`);
		}
		writeFileSync(file, JSON.stringify(next));
	} catch (e) {
		console.log(`  skip ${city.name}: ${(e as Error).message}`);
	}
}
console.log(`done: ${clipped} coastal cities clipped`);
