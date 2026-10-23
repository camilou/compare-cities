import { json, error } from '@sveltejs/kit';
import { cacheHeaders, edgeCached, USER_AGENT } from '$lib/server/upstream';
import { loadCity } from '$lib/server/assets';
import { overpass, parseTransit, polyFilters, transitQuery, type TransitStats } from '$lib/osm';
import { mainland } from '$lib/geo';
import type { RequestHandler } from './$types';

const MONTH = 60 * 60 * 24 * 30;

export const GET: RequestHandler = async (event) => {
	const id = event.url.searchParams.get('id') ?? '';
	if (!/^[RW]\d{1,12}$/.test(id)) error(400, 'Bad id');

	const stats = await edgeCached<TransitStats>(`transit/v2/${id}`, event.platform, MONTH, async () => {
		const city = await loadCity(event, id);
		if (city.transit) return city.transit;
		const query = transitQuery(polyFilters(mainland(city.geometry, city.center)));
		return parseTransit(await overpass(query, { headers: { 'User-Agent': USER_AGENT } }));
	}).catch(() => error(503, 'OpenStreetMap is busy right now. Try again in a minute.'));

	return json(stats, { headers: cacheHeaders(MONTH) });
};
