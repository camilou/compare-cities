// Loaders for a city's slower statistics. Cached cities carry them in their
// static file; everything else is fetched live and remembered in localStorage.
import { fetchClimate, type Climate } from './climate';
import { areaId, greenQuery, measureGreen, overpass, type GreenStats, type TransitStats } from './osm';
import type { Area, City } from './types';

const read = <T>(key: string): T | undefined => {
	try {
		const v = localStorage.getItem(key);
		return v ? (JSON.parse(v) as T) : undefined;
	} catch {
		return undefined;
	}
};
const write = (key: string, v: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(v));
	} catch {
		/* storage full or blocked: skip */
	}
};

async function remembered<T>(key: string, load: () => Promise<T>): Promise<T> {
	const hit = read<T>(key);
	if (hit) return hit;
	const v = await load();
	write(key, v);
	return v;
}

/** The static per-city file if we have one, otherwise the live API. */
export async function fetchCity(pick: { id: string } | { q: string }): Promise<City> {
	if ('id' in pick) {
		const cached = await fetch(`/cities/${pick.id}.json`).catch(() => undefined);
		if (cached?.ok) return cached.json();
	}
	const qs = 'id' in pick ? `id=${pick.id}` : `q=${encodeURIComponent(pick.q)}`;
	const res = await fetch(`/api/city?${qs}`);
	if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'That city could not be loaded.');
	return res.json();
}

export function cityClimate(city: City): Promise<Climate> {
	if (city.climate) return Promise.resolve(city.climate);
	return remembered(`climate:v3:${city.id}`, () => fetchClimate(city.center, city.facts.elevation));
}

/** Transit counts come from our API, which caches Overpass at the edge. */
export function cityTransit(city: City): Promise<TransitStats> {
	if (city.transit) return Promise.resolve(city.transit);
	return remembered(`transit:v1:${city.id}`, async () => {
		const res = await fetch(`/api/transit?id=${city.id}`);
		if (!res.ok) throw new Error('Transit data is unavailable right now.');
		return res.json();
	});
}

/**
 * Green space needs every park polygon, which is too heavy for a free Worker,
 * so the browser fetches it from Overpass and rasterises it locally.
 */
export function cityGreen(city: City, shape: Area, km2: number): Promise<GreenStats> {
	if (city.green) return Promise.resolve(city.green);
	return remembered(`green:v1:${city.id}`, async () => {
		const area = areaId(city.id);
		if (!area) throw new Error('No boundary to measure.');
		return measureGreen(await overpass(greenQuery(area)), shape, km2);
	});
}
