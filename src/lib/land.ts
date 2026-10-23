// Removes sea from city outlines (San Francisco's official boundary is 80% ocean).
//
// The sea comes from the `water` layer of OpenFreeMap's vector tiles, class
// "ocean": OpenStreetMap's coastline-derived water, so it includes bays and
// harbours but not rivers or lakes (the Seine stays part of Paris).
// Shared by the cache scripts (tiles cached on disk) and the browser (live cities).
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import polygonClipping, { type MultiPolygon as PCMulti, type Polygon as PCPoly } from 'polygon-clipping';
import type { Area } from './types';

export const TILEJSON = 'https://tiles.openfreemap.org/planet';
export type TileLoader = (z: number, x: number, y: number, signal?: AbortSignal) => Promise<Uint8Array>;

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

/** Ocean polygons covering a bounding box, from the most detailed zoom that stays under maxTiles. */
async function oceanAround(
	g: Area,
	tile: TileLoader,
	maxTiles: number,
	maxZoom: number,
	signal?: AbortSignal
): Promise<PCMulti | undefined> {
	const { w, s, e, n } = bounds(g);
	// Outlines spanning the antimeridian or a continent aren't cities we can clip sensibly.
	if (e - w > 10 || n - s > 10) return undefined;
	const count = (z: number) => (lon2x(e, z) - lon2x(w, z) + 1) * (lat2y(s, z) - lat2y(n, z) + 1);
	let z = maxZoom;
	while (z > 8 && count(z) > maxTiles) z--;
	if (count(z) > maxTiles) return undefined; // the cap is a hard limit, not a suggestion
	const jobs: Promise<PCMulti>[] = [];
	for (let x = lon2x(w, z); x <= lon2x(e, z); x++) {
		for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
			jobs.push(
				tile(z, x, y, signal).then((buf) => {
					const out: PCMulti = [];
					if (!buf.length) return out;
					const layer = new VectorTile(new PbfReader(buf)).layers.water;
					for (let i = 0; i < (layer?.length ?? 0); i++) {
						const f = layer!.feature(i);
						if (f.properties.class !== 'ocean') continue;
						const geo = f.toGeoJSON(x, y, z).geometry;
						if (geo.type === 'Polygon') out.push(geo.coordinates as PCPoly);
						else if (geo.type === 'MultiPolygon') out.push(...(geo.coordinates as PCMulti));
					}
					return out;
				})
			);
		}
	}
	return (await Promise.all(jobs)).flat();
}

/** The city outline minus the sea, or the original if it has no coastline. */
export async function clipToLand(
	g: Area,
	tile: TileLoader,
	{ maxTiles = 64, maxZoom = 12, signal }: { maxTiles?: number; maxZoom?: number; signal?: AbortSignal } = {}
): Promise<{ geometry: Area; touched: boolean }> {
	const ocean = await oceanAround(g, tile, maxTiles, maxZoom, signal);
	if (!ocean?.length) return { geometry: g, touched: false };
	signal?.throwIfAborted();
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

let template: Promise<string> | undefined;
/** The current tile URL template (OpenFreeMap rotates planet versions). */
export function tileUrl(init?: RequestInit) {
	return (template ??= fetch(TILEJSON, init)
		.then((r) => r.json() as Promise<{ tiles: string[] }>)
		.then((j) => j.tiles[0]));
}

/** Plain HTTP tile loader: the browser's own cache keeps repeat visits free. */
export const fetchTile: TileLoader = async (z, x, y, signal) => {
	const url = (await tileUrl()).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
	const res = await fetch(url, { signal });
	if (res.status === 204 || res.status === 404) return new Uint8Array();
	if (!res.ok) throw new Error(`tile ${z}/${x}/${y}: ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
};
