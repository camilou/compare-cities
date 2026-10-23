// OpenStreetMap statistics via the Overpass API. Shared by the server endpoint,
// the browser (green space) and scripts/enrich-city-cache.ts.
import type { Area } from './types';

export const OVERPASS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter',
	'https://overpass.private.coffee/api/interpreter'
];

/** Overpass area id for a Nominatim/OSM id such as "R7444". */
export function areaId(osmId: string) {
	const n = Number(osmId.slice(1));
	if (osmId[0] === 'R') return 3_600_000_000 + n;
	if (osmId[0] === 'W') return 2_400_000_000 + n;
	return undefined;
}

export async function overpass<T = OverpassResult>(query: string, init: RequestInit = {}): Promise<T> {
	let last: unknown;
	for (const endpoint of OVERPASS) {
		try {
			const res = await fetch(endpoint, {
				...init,
				method: 'POST',
				body: new URLSearchParams({ data: query })
			});
			if (res.ok && res.headers.get('content-type')?.includes('json')) return (await res.json()) as T;
			last = new Error(`Overpass ${res.status} at ${new URL(endpoint).host}`);
		} catch (e) {
			if ((e as Error).name === 'AbortError') throw e;
			last = e;
		}
	}
	throw last;
}

interface OverpassElement {
	type: 'node' | 'way' | 'relation' | 'stat';
	tags?: Record<string, string>;
	geometry?: { lat: number; lon: number }[];
	members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}
export interface OverpassResult {
	elements: OverpassElement[];
}

// ---- Transit and cycling -------------------------------------------------------

export interface TransitStats {
	metroKm: number; // km of metro / light-rail / monorail track
	lines: number;
	stations: number;
	bikeKm: number; // cycleways plus painted/protected lanes
	buswayKm: number; // bus-only roads (BRT)
}

export const transitQuery = (area: number) => `[out:json][timeout:180];
area(id:${area})->.a;
way(area.a)[railway~"^(subway|light_rail|monorail)$"][!service]; make stat k="metro",len=sum(length()); out;
way(area.a)[highway=busway]; make stat k="busway",len=sum(length()); out;
(way(area.a)[highway=cycleway]; way(area.a)[~"^cycleway(:both|:left|:right)?$"~"^(lane|track)$"];); make stat k="bike",len=sum(length()); out;
nwr(area.a)[railway=station][station~"^(subway|light_rail|monorail)$"]; out tags;
rel(area.a)[route~"^(subway|light_rail|monorail)$"]; out tags;`;

export function parseTransit(r: OverpassResult): TransitStats {
	const km: Record<string, number> = {};
	const stations = new Set<string>();
	const lines = new Set<string>();
	for (const e of r.elements) {
		const t = e.tags ?? {};
		if (e.type === 'stat') km[t.k] = Number(t.len) / 1000;
		else if (e.type === 'relation') (t.ref ?? t.name ?? '').split(';').forEach((l) => l.trim() && lines.add(l.trim()));
		else stations.add(t.name ?? `${e.type}${stations.size}`);
	}
	// Without any rail track, "stations" and "lines" are mis-tagged bus routes.
	const hasRail = (km.metro ?? 0) >= 1;
	return {
		metroKm: Math.round(km.metro ?? 0),
		buswayKm: Math.round(km.busway ?? 0),
		bikeKm: Math.round(km.bike ?? 0),
		stations: hasRail ? stations.size : 0,
		lines: hasRail ? lines.size : 0
	};
}

// ---- Green space ------------------------------------------------------------------

export interface GreenStats {
	parksPct: number; // parks, gardens, reserves
	greenPct: number; // parks plus forests, grass and other vegetation
	parksKm2: number;
}

const PARKS = 'park|garden|nature_reserve|recreation_ground|dog_park';
export const greenQuery = (area: number) => `[out:json][timeout:180];
area(id:${area})->.a;
(
  wr(area.a)[leisure~"^(${PARKS}|golf_course)$"];
  wr(area.a)[landuse~"^(forest|grass|meadow|village_green|recreation_ground|orchard)$"];
  wr(area.a)[natural~"^(wood|scrub|grassland|heath|wetland)$"];
);
out geom qt;`;

type XY = [number, number];

/** Join way fragments of a multipolygon relation into closed rings. */
function assembleRings(parts: XY[][]): XY[][] {
	const open = parts.filter((p) => p.length > 1).map((p) => [...p]);
	const rings: XY[][] = [];
	const same = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1];
	while (open.length) {
		const ring = open.pop()!;
		let grown = true;
		while (!same(ring[0], ring[ring.length - 1]) && grown) {
			grown = false;
			const end = ring[ring.length - 1];
			for (let i = 0; i < open.length; i++) {
				const p = open[i];
				if (same(p[0], end)) ring.push(...p.slice(1));
				else if (same(p[p.length - 1], end)) ring.push(...p.slice(0, -1).reverse());
				else continue;
				open.splice(i, 1);
				grown = true;
				break;
			}
		}
		rings.push(ring);
	}
	return rings;
}

/** A coarse even-odd rasteriser over a fixed grid. Overlaps union for free. */
class Grid {
	cells: Uint8Array;
	w: number;
	h: number;
	project: (p: XY) => XY;
	constructor(w: number, h: number, project: (p: XY) => XY) {
		this.w = w;
		this.h = h;
		this.project = project;
		this.cells = new Uint8Array(w * h);
	}
	fill(rings: XY[][], bit: number) {
		const pts = rings.map((r) => r.map(this.project));
		let minY = Infinity, maxY = -Infinity;
		for (const r of pts) for (const p of r) (minY = Math.min(minY, p[1])), (maxY = Math.max(maxY, p[1]));
		const y0 = Math.max(0, Math.floor(minY));
		const y1 = Math.min(this.h - 1, Math.ceil(maxY));
		const xs: number[] = [];
		for (let y = y0; y <= y1; y++) {
			const cy = y + 0.5;
			xs.length = 0;
			for (const r of pts) {
				for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
					const [xa, ya] = r[i];
					const [xb, yb] = r[j];
					if (ya > cy !== yb > cy) xs.push(xa + ((cy - ya) / (yb - ya)) * (xb - xa));
				}
			}
			xs.sort((a, b) => a - b);
			for (let k = 0; k + 1 < xs.length; k += 2) {
				const from = Math.max(0, Math.ceil(xs[k] - 0.5));
				const to = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
				for (let x = from; x <= to; x++) this.cells[y * this.w + x] |= bit;
			}
		}
	}
}

/**
 * Share of the city boundary covered by parks / any green, measured by rasterising
 * everything onto a ~1 000 px grid in a local equal-area-ish projection.
 */
export function measureGreen(r: OverpassResult, boundary: Area, cityKm2: number): GreenStats {
	const rings: XY[][] = (boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates).flat() as XY[][];
	let w = 180, e = -180, s = 90, n = -90;
	for (const ring of rings) for (const [x, y] of ring) (w = Math.min(w, x)), (e = Math.max(e, x)), (s = Math.min(s, y)), (n = Math.max(n, y));
	const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
	const spanX = (e - w) * k;
	const spanY = n - s;
	const scale = 1000 / Math.max(spanX, spanY);
	const W = Math.max(1, Math.ceil(spanX * scale));
	const H = Math.max(1, Math.ceil(spanY * scale));
	const grid = new Grid(W, H, ([x, y]) => [(x - w) * k * scale, (n - y) * scale]);

	const CITY = 1, PARK = 2, GREEN = 4;
	grid.fill(rings, CITY);
	const parkRe = new RegExp(`^(${PARKS})$`);
	for (const el of r.elements) {
		let parts: XY[][] = [];
		if (el.type === 'way' && el.geometry) parts = [el.geometry.map((g) => [g.lon, g.lat] as XY)];
		else if (el.type === 'relation' && el.members)
			parts = assembleRings(
				el.members.filter((m) => m.type === 'way' && m.geometry).map((m) => m.geometry!.map((g) => [g.lon, g.lat] as XY))
			);
		if (!parts.length) continue;
		const isPark = parkRe.test(el.tags?.leisure ?? '');
		grid.fill(parts, isPark ? PARK | GREEN : GREEN);
	}

	let city = 0, parks = 0, green = 0;
	for (const c of grid.cells) {
		if (!(c & CITY)) continue;
		city++;
		if (c & PARK) parks++;
		if (c & GREEN) green++;
	}
	const pct = (v: number) => (city ? Math.round((v / city) * 1000) / 10 : 0);
	return { parksPct: pct(parks), greenPct: pct(green), parksKm2: Math.round(((parks / Math.max(city, 1)) * cityKm2) * 10) / 10 };
}
