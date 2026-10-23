// Removes sea from city outlines (San Francisco's boundary is 80% ocean).
//
// The sea comes from the `water` layer of OpenFreeMap's vector tiles, class
// "ocean": OpenStreetMap's coastline-derived water, so it includes bays and
// harbours but not rivers or lakes (the Seine stays part of Paris).
// Tiles are cached on disk so each one is only ever downloaded once.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import polygonClipping, { type MultiPolygon as PCMulti, type Polygon as PCPoly } from 'polygon-clipping';
import type { Area } from '../../src/lib/types.ts';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const CACHE = new URL('../.tilecache/', import.meta.url);
const UA = { headers: { 'User-Agent': 'CompareCities/1.0 (+https://github.com/camilou/compare-cities; land clipping)' } };
const MAX_TILES = 64;

let template: Promise<string> | undefined;
const tileUrl = () =>
	(template ??= fetch(TILEJSON, UA)
		.then((r) => r.json())
		.then((j: { tiles: string[] }) => j.tiles[0]));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tile(z: number, x: number, y: number): Promise<Uint8Array> {
	mkdirSync(CACHE, { recursive: true });
	const file = new URL(`${z}-${x}-${y}.pbf`, CACHE);
	if (existsSync(file)) return readFileSync(file);
	const url = (await tileUrl()).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
	for (let attempt = 0; attempt < 4; attempt++) {
		const res = await fetch(url, UA).catch(() => undefined);
		if (res?.ok) {
			const buf = new Uint8Array(await res.arrayBuffer());
			writeFileSync(file, buf);
			await wait(50); // gentle, even on a CDN
			return buf;
		}
		if (res?.status === 204 || res?.status === 404) return new Uint8Array(); // empty tile
		await wait(2000 * (attempt + 1));
	}
	throw new Error(`tile ${z}/${x}/${y} failed`);
}

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
	const r = (lat * Math.PI) / 180;
	return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function bounds(g: Area) {
	let w = 180, s = 90, e = -180, n = -90;
	const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
	for (const p of polys) for (const [x, y] of p[0]) (w = Math.min(w, x)), (e = Math.max(e, x)), (s = Math.min(s, y)), (n = Math.max(n, y));
	return { w, s, e, n };
}

/** Ocean polygons covering a bounding box, from the most detailed zoom that stays under MAX_TILES. */
async function oceanAround(g: Area): Promise<PCMulti> {
	const { w, s, e, n } = bounds(g);
	let z = 12; // ~5 m precision; plenty for city outlines, 4× fewer tiles than z13
	while (z > 8 && (lon2x(e, z) - lon2x(w, z) + 1) * (lat2y(s, z) - lat2y(n, z) + 1) > MAX_TILES) z--;
	const ocean: PCMulti = [];
	for (let x = lon2x(w, z); x <= lon2x(e, z); x++) {
		for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
			const buf = await tile(z, x, y);
			if (!buf.length) continue;
			const layer = new VectorTile(new PbfReader(buf)).layers.water;
			for (let i = 0; i < (layer?.length ?? 0); i++) {
				const f = layer!.feature(i);
				if (f.properties.class !== 'ocean') continue;
				const geo = f.toGeoJSON(x, y, z).geometry;
				if (geo.type === 'Polygon') ocean.push(geo.coordinates as PCPoly);
				else if (geo.type === 'MultiPolygon') ocean.push(...(geo.coordinates as PCMulti));
			}
		}
	}
	return ocean;
}

/** The city outline minus the sea, or the original if it has no coastline. */
export async function clipToLand(g: Area): Promise<{ geometry: Area; touched: boolean }> {
	const ocean = await oceanAround(g);
	if (!ocean.length) return { geometry: g, touched: false };
	const city = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as PCMulti;
	const land = polygonClipping.difference(city, polygonClipping.union(ocean));
	if (!land.length) return { geometry: g, touched: false }; // never return an empty city
	const r = (n: number) => Math.round(n * 1e5) / 1e5;
	const coordinates = land.map((poly) => poly.map((ring) => ring.map(([x, y]) => [r(x), r(y)])));
	return {
		geometry: coordinates.length === 1 ? { type: 'Polygon', coordinates: coordinates[0] } : { type: 'MultiPolygon', coordinates },
		touched: true
	};
}
