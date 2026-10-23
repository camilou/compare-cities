// Builds a static cache of the world's most populous cities so they load instantly:
//   static/cities/<osm id>.json   full city (outline, facts, summary) as /api/city returns it
//   src/lib/data/city-index.json  [id, name, country code, context, population] for instant search
//
// Usage (dev server running, it does the polite upstream fetching + parsing):
//   node --experimental-strip-types scripts/build-city-cache.ts [count=1000] [http://localhost:5173]
// Resumable: cities already in static/cities/ are skipped.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { City } from '../src/lib/types.ts';

const COUNT = Number(process.argv[2] ?? 1000);
const BASE = process.argv[3] ?? 'http://localhost:5173';
const UA = 'CompareCities/0.2 (city cache builder)';
const DIR = new URL('../static/cities/', import.meta.url);
const INDEX = new URL('../src/lib/data/city-index.json', import.meta.url);
const CANDIDATES = new URL('./data/city-candidates.json', import.meta.url);
mkdirSync(DIR, { recursive: true });
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Stage 1: candidate cities from Wikidata -----------------------------------
// Wikidata types cities in many country-specific ways, so we ask per type (fast)
// rather than walking the whole subclass tree (times out).
const TYPES = [
	'Q515', // city
	'Q1549591', // big city
	'Q1637706', // city with millions of inhabitants
	'Q200250', // metropolis
	'Q174844', // megacity
	'Q5119', // capital city
	'Q22865', // independent city
	'Q1093829', // city of the United States
	'Q2074737', // municipality of Spain
	'Q3184121', // municipality of Brazil
	'Q2555896', // municipality of Colombia
	'Q747074', // comune of Italy
	'Q484170', // commune of France
	'Q42744322', // urban municipality of Germany
	'Q1066984', // metropolitan municipality of Turkey
	'Q748149', // prefecture-level city of China
	'Q494721', // city of Japan
	'Q15284' // municipality
];

interface Candidate {
	q: string;
	pop: number;
	osm?: string;
	name?: string;
}

async function sparql(query: string) {
	const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
	const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
	if (!res.ok) throw new Error(`SPARQL ${res.status}`);
	return ((await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }).results.bindings;
}

async function candidates(): Promise<Candidate[]> {
	if (existsSync(CANDIDATES)) return JSON.parse(readFileSync(CANDIDATES, 'utf8'));
	const by = new Map<string, Candidate>();
	for (const t of TYPES) {
		const rows = await sparql(
			`SELECT ?c ?pop ?osm WHERE { ?c wdt:P31 wd:${t} ; wdt:P1082 ?pop . OPTIONAL { ?c wdt:P402 ?osm } FILTER(?pop > 300000) }`
		).catch((e) => (console.log(`  type ${t} failed: ${e.message}`), []));
		for (const r of rows) {
			const q = r.c.value.split('/').pop()!;
			const pop = Number(r.pop.value);
			const prev = by.get(q);
			by.set(q, { q, pop: Math.max(pop, prev?.pop ?? 0), osm: r.osm?.value ?? prev?.osm });
		}
		console.log(`type ${t}: ${rows.length} rows, ${by.size} cities so far`);
		await wait(500);
	}
	const list = [...by.values()].sort((a, b) => b.pop - a.pop);
	// English labels, 50 at a time.
	for (let i = 0; i < list.length; i += 50) {
		const ids = list.slice(i, i + 50).map((c) => c.q).join('|');
		type Labels = { entities: Record<string, { labels?: { en?: { value: string } } }> };
		let data: Labels | undefined;
		for (let attempt = 0; attempt < 6 && !data; attempt++) {
			const res = await fetch(
				`https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&props=labels&languages=en&ids=${ids}`,
				{ headers: { 'User-Agent': UA } }
			);
			if (res.ok) data = (await res.json().catch(() => undefined)) as Labels | undefined;
			if (!data) await wait(5000 * (attempt + 1)); // rate limited: back off
		}
		for (const c of list.slice(i, i + 50)) c.name = data?.entities[c.q]?.labels?.en?.value;
		await wait(1500);
	}
	writeFileSync(CANDIDATES, JSON.stringify(list));
	return list;
}

// ---- Stage 2: resolve OSM boundary + fetch through our API ------------------------

async function resolveOsm(c: Candidate): Promise<string | undefined> {
	if (c.osm) return `R${c.osm}`;
	if (!c.name) return undefined;
	// Nominatim: accept only a result that links back to the same Wikidata item.
	const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&limit=10&q=${encodeURIComponent(c.name)}`;
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	await wait(1100); // Nominatim usage policy: max 1 request per second
	if (!res.ok) return undefined;
	const hits = (await res.json()) as { osm_type: string; osm_id: number; extratags?: { wikidata?: string } }[];
	const hit = hits.find((h) => h.extratags?.wikidata === c.q && h.osm_type === 'relation');
	return hit ? `R${hit.osm_id}` : undefined;
}

/** Round coordinates to 5 decimals (~1 m) to keep files small. */
function shrink(city: City): City {
	const r = (n: number) => Math.round(n * 1e5) / 1e5;
	const ring = (ps: number[][]) => ps.map(([x, y]) => [r(x), r(y)]);
	const g = city.geometry;
	const geometry =
		g.type === 'Polygon'
			? { type: 'Polygon' as const, coordinates: g.coordinates.map(ring) }
			: { type: 'MultiPolygon' as const, coordinates: g.coordinates.map((p) => p.map(ring)) };
	return { ...city, geometry };
}

type IndexRow = [id: string, name: string, cc: string, context: string, pop: number];
const index: IndexRow[] = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : [];
const indexed = new Set(index.map((r) => r[0]));

const list = await candidates();
console.log(`${list.length} candidates; building the top ${COUNT}`);

let done = index.length;
const seenOsm = new Set(indexed);
for (const c of list) {
	if (done >= COUNT) break;
	const id = await resolveOsm(c).catch(() => undefined);
	if (!id || seenOsm.has(id)) continue;
	seenOsm.add(id);
	const file = new URL(`${id}.json`, DIR);
	try {
		let city: City;
		if (existsSync(file)) city = JSON.parse(readFileSync(file, 'utf8'));
		else {
			const res = await fetch(`${BASE}/api/city?id=${id}`);
			if (!res.ok) throw new Error(`api ${res.status}`);
			city = shrink((await res.json()) as City);
			writeFileSync(file, JSON.stringify(city));
			await wait(1200); // the API made Nominatim + Wikidata calls on our behalf
		}
		if (!indexed.has(city.id)) {
			const context = city.displayName.split(', ').slice(1).filter((p) => p !== city.name).slice(-2).join(', ');
			index.push([city.id, city.name, city.countryCode, context, Math.round(city.facts.population?.value ?? c.pop)]);
			indexed.add(city.id);
			done++;
			if (done % 10 === 0) writeFileSync(INDEX, JSON.stringify(index));
			console.log(`${done}/${COUNT} ${city.name} (${id})`);
		}
	} catch (e) {
		console.log(`  skip ${c.name} ${id}: ${(e as Error).message}`);
	}
}
index.sort((a, b) => b[4] - a[4]);
writeFileSync(INDEX, JSON.stringify(index));
console.log(`done: ${index.length} cities`);
