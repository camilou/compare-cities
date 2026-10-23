// Adds climate, transit and green-space stats to every file in static/cities/,
// biggest cities first, so cached cities need no slow lookups at all.
//
//   node --experimental-strip-types scripts/enrich-city-cache.ts [climate,transit,green]
//
// Resumable and polite: one request at a time per service, and the green pass
// keeps under Overpass's ~1 GB/day fair-use guideline (it pauses when it hits it).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchClimate } from '../src/lib/climate.ts';
import { greenQuery, measureGreen, overpass, parseTransit, polyFilters, transitQuery } from '../src/lib/osm.ts';
import { areaKm2, mainland } from '../src/lib/geo.ts';
import type { City } from '../src/lib/types.ts';

const DIR = new URL('../static/cities/', import.meta.url);
const PASSES = (process.argv[2] ?? 'climate,transit,green').split(',');
const UA = { headers: { 'User-Agent': 'CompareCities/0.2 (city cache enrichment)' } };
const GREEN_BYTES_PER_DAY = 900e6;
const GREEN_MAX_KM2 = 5000; // beyond this the park download is a province's worth of forest
const TRANSIT_MAX_KM2 = 20000; // beyond this Overpass times out (looking at you, Chongqing)
const INDEX = new URL('../src/lib/data/city-index.json', import.meta.url);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (pass: string, msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)} ${pass}] ${msg}`);

/** Cached city files, most famous first (the index is kept in that order). */
function files(): { file: URL }[] {
	let order: string[] = [];
	try {
		order = (JSON.parse(readFileSync(INDEX, 'utf8')) as [string][]).map((r) => r[0]);
	} catch {
		/* index being rewritten: fall back to directory order */
	}
	const rank = new Map(order.map((id, i) => [id, i]));
	return readdirSync(DIR)
		.filter((f) => f.endsWith('.json'))
		.sort((a, b) => (rank.get(a.slice(0, -5)) ?? 1e9) - (rank.get(b.slice(0, -5)) ?? 1e9))
		.map((f) => ({ file: new URL(f, DIR) }));
}

/** Read-modify-write with no await in between, so parallel passes never clobber each other. */
function patch(file: URL, fields: Partial<City>) {
	const c = JSON.parse(readFileSync(file, 'utf8')) as City;
	writeFileSync(file, JSON.stringify({ ...c, ...fields }));
}

async function retry<T>(pass: string, name: string, fn: () => Promise<T>, tries = 3): Promise<T | undefined> {
	for (let i = 0; i < tries; i++) {
		try {
			return await fn();
		} catch (e) {
			log(pass, `${name}: ${(e as Error).message}; retrying in ${30 * (i + 1)}s`);
			await wait(30_000 * (i + 1));
		}
	}
	log(pass, `${name}: giving up for now`);
}

type Pass = { key: 'climate' | 'transit' | 'green'; gap: number; run: (c: City) => Promise<Partial<City> | undefined> };

// Transit and green both use Overpass: never more than one query in flight, with a
// generous pause after each, so a shared free service doesn't notice we exist.
let overpassQueue: Promise<unknown> = Promise.resolve();
function politely<T>(fn: () => Promise<T>): Promise<T> {
	const run = overpassQueue.then(fn, fn);
	overpassQueue = run.then(
		() => wait(20_000),
		() => wait(60_000)
	);
	return run;
}

let greenBytes = 0;
let greenDayStart = Date.now();

const passes: Pass[] = [
	{
		key: 'climate',
		gap: 1000,
		run: async (c) => ({ climate: await fetchClimate(c.center, c.facts.elevation) })
	},
	{
		key: 'transit',
		gap: 0, // pacing handled by politely()
		run: async (c) => {
			const shape = mainland(c.geometry, c.center);
			if (areaKm2(shape) > TRANSIT_MAX_KM2) return { transit: null };
			return { transit: parseTransit(await politely(() => overpass(transitQuery(polyFilters(shape)), UA))) };
		}
	},
	{
		key: 'green',
		gap: 0, // pacing handled by politely()
		run: async (c) => {
			const shape = mainland(c.geometry, c.center);
			const km2 = areaKm2(shape);
			if (km2 > GREEN_MAX_KM2) return { green: null };
			if (Date.now() - greenDayStart > 86_400_000) (greenBytes = 0), (greenDayStart = Date.now());
			if (greenBytes > GREEN_BYTES_PER_DAY) {
				const ms = 86_400_000 - (Date.now() - greenDayStart);
				log('green', `daily download budget reached; pausing ${Math.round(ms / 3_600_000)} h`);
				await wait(ms);
				(greenBytes = 0), (greenDayStart = Date.now());
			}
			const r = await politely(() => overpass(greenQuery(polyFilters(shape)), UA));
			greenBytes += JSON.stringify(r).length;
			return { green: measureGreen(r, shape, km2) };
		}
	}
];

async function loop(p: Pass) {
	let idle = 0;
	// Keep checking for an hour after the last new file: the city builder may still be running.
	while (idle < 60) {
		let did = 0;
		for (const { file } of files()) {
			const c = JSON.parse(readFileSync(file, 'utf8')) as City;
			if (c[p.key] !== undefined) continue; // null counts as done (too large to measure)
			const t0 = Date.now();
			const fields = await retry(p.key, c.name, () => p.run(c));
			if (fields) {
				patch(file, fields);
				did++;
				log(p.key, `${c.name}: ${JSON.stringify(fields[p.key] ?? 'too large, skipped').slice(0, 90)} (${Math.round((Date.now() - t0) / 1000)}s)`);
			}
			await wait(p.gap);
		}
		idle = did ? 0 : idle + 1;
		if (!did) await wait(60_000); // wait for the city builder to add more files
	}
	log(p.key, 'all cities done');
}

await Promise.all(passes.filter((p) => PASSES.includes(p.key)).map(loop));
