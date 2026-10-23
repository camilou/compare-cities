import { error, isHttpError, json } from '@sveltejs/kit';
import { cacheHeaders, edgeCached } from '$lib/server/upstream';
import { getCity } from '$lib/server/city';
import type { RequestHandler } from './$types';

const MONTH = 60 * 60 * 24 * 30;

export const GET: RequestHandler = async ({ url, platform }) => {
	const id = url.searchParams.get('id');
	const q = url.searchParams.get('q')?.trim().toLowerCase().slice(0, 100) ?? null;
	// Keep the finished city, not just the upstream answers: one lookup per city per month.
	const key = id ? `city/v1/id/${id}` : `city/v1/q/${encodeURIComponent(q ?? '')}`;
	const city = await edgeCached(key, platform, MONTH, () => getCity(id, q, platform)).catch((e) => {
		if (isHttpError(e)) throw e; // "not found" and friends pass through
		error(503, 'The map services are busy right now. Try again in a minute.');
	});
	return json(city, { headers: cacheHeaders(60 * 60 * 24 * 7) });
};
