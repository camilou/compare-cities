import { json } from '@sveltejs/kit';
import { cacheHeaders } from '$lib/server/upstream';
import { getCity } from '$lib/server/city';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform }) => {
	const city = await getCity(url.searchParams.get('id'), url.searchParams.get('q'), platform);
	return json(city, { headers: cacheHeaders(60 * 60 * 24 * 7) });
};
