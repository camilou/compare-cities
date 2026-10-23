import { error, redirect } from '@sveltejs/kit';
import { asset, cachedCity } from '$lib/server/assets';
import { svgToPng } from '$lib/server/resvg';
import { buildBrandSvg, buildCardSvg, cardInput, CARD_SIZE } from '$lib/share/card';
import { areaKm2, mainland, simplifyTo } from '$lib/geo';
import { allowed, tooMany, type Limiter } from '$lib/server/limits';
import type { City } from '$lib/types';
import type { RequestHandler } from './$types';

// Link-preview images: /og/R7426387-R7444.png for a pair of cached cities.
// /og/default.png is a static file (static/og/default.png); this route only draws
// it as a fallback in dev. Rendering costs real CPU, so:
//   - only cities from the static cache are drawn (random ids get the default card)
//   - finished images live in the edge cache
//   - fresh renders are rate limited per IP; cached images never are, so preview
//     bots fetching a viral link from one IP still get served.
export const GET: RequestHandler = async (event) => {
	const isDefault = event.params.pair === 'default.png';
	const m = event.params.pair.match(/^([RW]\d{1,12})-([RW]\d{1,12})\.png$/);
	if (!m && !isDefault) error(404, 'Not found');

	const cache = event.platform?.caches?.default;
	// Key on the path only, so junk query strings can't force fresh renders.
	const key = new Request(`${event.url.origin}${event.url.pathname}`);
	const hit = await cache?.match(key).catch(() => undefined);
	if (hit) return hit;

	let svg: string;
	if (isDefault || !m) {
		svg = buildBrandSvg(event.url.host);
	} else {
		const [a, b] = await Promise.all([cachedCity(event, m[1]), cachedCity(event, m[2])]);
		if (!a || !b) redirect(302, '/og/default.png');
		const side = (c: City) => {
			const shape = mainland(c.geometry, c.center);
			return { name: c.name, shape: simplifyTo(shape, 1200), center: c.center, areaKm2: areaKm2(shape), population: c.facts.population?.value };
		};
		svg = buildCardSvg(cardInput(side(a), side(b), event.url.host), 'landscape');
	}

	const limiter = (event.platform?.env as { RENDER_LIMITER?: Limiter } | undefined)?.RENDER_LIMITER;
	if (!(await allowed(limiter, event.getClientAddress()))) return tooMany();

	const fonts = await Promise.all(
		['/fonts/bricolage-500.ttf', '/fonts/bricolage-800.ttf', '/fonts/unbounded-700.ttf'].map(async (p) => {
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
