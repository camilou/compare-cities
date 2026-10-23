import { json, error } from '@sveltejs/kit';
import { cachedJson, cacheHeaders } from '$lib/server/upstream';
import type { Suggestion } from '$lib/types';
import type { RequestHandler } from './$types';

interface PhotonFeature {
	properties: {
		osm_type: 'N' | 'W' | 'R';
		osm_id: number;
		osm_value: string;
		name?: string;
		state?: string;
		county?: string;
		country?: string;
		countrycode?: string;
		type: string;
	};
}

// Bigger kinds of places first, so "Bogotá, Colombia" beats "Bogota, NJ".
const RANK: Record<string, number> = { city: 0, municipality: 1, borough: 2, town: 3, suburb: 4, village: 6 };

export const GET: RequestHandler = async ({ url, platform }) => {
	// Normalised so "  Bogotá " and "bogotá" share one cache entry.
	const q = url.searchParams.get('q')?.trim().replace(/\s+/g, ' ').toLowerCase();
	if (!q || q.length < 2) return json([]);
	if (q.length > 80) error(400, 'Query too long');

	const photon = new URL('https://photon.komoot.io/api/');
	photon.searchParams.set('q', q);
	photon.searchParams.set('limit', '12');
	for (const layer of ['city', 'district', 'county', 'locality']) photon.searchParams.append('layer', layer);

	const data = await cachedJson<{ features: PhotonFeature[] }>(photon.toString(), platform, 60 * 60 * 24 * 30).catch(() => null);
	// Upstream busy or down: the built-in city list still works, so just say "nothing extra".
	if (!data) return json([], { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });

	const seen = new Set<string>();
	const results: Suggestion[] = data.features
		.map((f) => f.properties)
		.filter((p) => p.name && p.osm_type === 'R')
		.sort((a, b) => (RANK[a.osm_value] ?? 5) - (RANK[b.osm_value] ?? 5))
		.filter((p) => {
			const key = `${p.name}|${p.state}|${p.countrycode}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, 7)
		.map((p) => ({
			id: `R${p.osm_id}`,
			name: p.name!,
			context: [p.state !== p.name ? p.state : p.county, p.country].filter(Boolean).join(', '),
			countryCode: p.countrycode?.toUpperCase(),
			kind: p.osm_value
		}));

	return json(results, { headers: cacheHeaders(60 * 60 * 24 * 7) });
};
