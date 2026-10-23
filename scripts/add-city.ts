// Adds (or refreshes) specific cities in the static cache, by name or OSM id.
//
//   pnpm dev   (the local API does the polite upstream fetching)
//   node --experimental-strip-types scripts/add-city.ts "Jakarta" R111968 ... [--base http://localhost:5173]
//
// Each city is clipped to land, simplified, saved as static/cities/<id>.json and
// added to the search index. Run enrich-city-cache.ts afterwards for climate/transit/parks.
import { readFileSync, writeFileSync } from 'node:fs';
import { clipToLand } from './lib/land.ts';
import { simplifyTo } from '../src/lib/geo.ts';
import type { City } from '../src/lib/types.ts';

const args = process.argv.slice(2);
const baseAt = args.indexOf('--base');
const BASE = baseAt >= 0 ? args.splice(baseAt, 2)[1] : 'http://localhost:5173';
const DIR = new URL('../static/cities/', import.meta.url);
const INDEX = new URL('../src/lib/data/city-index.json', import.meta.url);

type IndexRow = [id: string, name: string, cc: string, context: string, pop: number];
const index: IndexRow[] = JSON.parse(readFileSync(INDEX, 'utf8'));

for (const arg of args) {
	const qs = /^[RW]\d+$/.test(arg) ? `id=${arg}` : `q=${encodeURIComponent(arg)}`;
	const res = await fetch(`${BASE}/api/city?${qs}`);
	if (!res.ok) {
		console.log(`${arg}: lookup failed (${res.status})`);
		continue;
	}
	let city = (await res.json()) as City;
	const { geometry } = await clipToLand(city.geometry);
	city = { ...city, geometry: simplifyTo(geometry, 3000), land: true };
	writeFileSync(new URL(`${city.id}.json`, DIR), JSON.stringify(city));

	const row: IndexRow = [city.id, city.name, city.countryCode, city.country, Math.round(city.facts.population?.value ?? 0)];
	const at = index.findIndex((r) => r[0] === city.id);
	if (at >= 0) index[at] = row;
	else index.push(row);
	console.log(`${arg}: saved ${city.name} (${city.id})`);
}
writeFileSync(INDEX, JSON.stringify(index));
