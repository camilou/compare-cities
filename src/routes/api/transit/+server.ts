import { json, error } from '@sveltejs/kit';
import { cacheHeaders, edgeCached, USER_AGENT } from '$lib/server/upstream';
import { areaId, overpass, parseTransit, transitQuery, type TransitStats } from '$lib/osm';
import type { RequestHandler } from './$types';

const MONTH = 60 * 60 * 24 * 30;

export const GET: RequestHandler = async ({ url, platform }) => {
	const id = url.searchParams.get('id') ?? '';
	const area = /^[RW]\d{1,12}$/.test(id) ? areaId(id) : undefined;
	if (!area) error(400, 'Bad id');

	const stats = await edgeCached<TransitStats>(`transit/v1/${id}`, platform, MONTH, async () =>
			parseTransit(await overpass(transitQuery(area), { headers: { 'User-Agent': USER_AGENT } }))
	).catch(() => error(503, 'OpenStreetMap is busy right now. Try again in a minute.'));

	return json(stats, { headers: cacheHeaders(MONTH) });
};
