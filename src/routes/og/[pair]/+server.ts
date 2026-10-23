import { error } from '@sveltejs/kit';
import { asset, loadCity } from '$lib/server/assets';
import { svgToPng } from '$lib/server/resvg';
import { buildCardSvg, cardInput, CARD_SIZE } from '$lib/share/card';
import { areaKm2, mainland } from '$lib/geo';
import type { RequestHandler } from './$types';

// Link-preview image for a pair of cities: /og/R7426387-R7444.png
export const GET: RequestHandler = async (event) => {
	const m = event.params.pair.match(/^([RW]\d{1,12})-([RW]\d{1,12})\.png$/);
	if (!m) error(404, 'Not found');

	const cache = event.platform?.caches?.default;
	// Key on the path only, so junk query strings can't force fresh renders.
	const key = new Request(`${event.url.origin}${event.url.pathname}`);
	const hit = await cache?.match(key).catch(() => undefined);
	if (hit) return hit;

	const [a, b] = await Promise.all([loadCity(event, m[1]), loadCity(event, m[2])]);
	const side = (c: typeof a) => {
		const shape = mainland(c.geometry, c.center);
		return { name: c.name, shape, center: c.center, areaKm2: areaKm2(shape), population: c.facts.population?.value };
	};
	const svg = buildCardSvg(cardInput(side(a), side(b), event.url.host), 'landscape');

	const fonts = await Promise.all(
		['/fonts/bricolage-500.ttf', '/fonts/bricolage-800.ttf'].map(async (p) => {
			const res = await asset(event, p);
			if (!res) error(500, 'Font missing');
			return new Uint8Array(await res.arrayBuffer());
		})
	);
	const png = await svgToPng(svg, fonts, CARD_SIZE.landscape[0]);

	const res = new Response(png as unknown as BodyInit, {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, s-maxage=2592000' }
	});
	if (cache) event.platform?.context?.waitUntil(cache.put(key, res.clone()).catch(() => {}));
	return res;
};
