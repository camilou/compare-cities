// Front door for every Worker request: rate limits, edge-cached shared pages and
// security headers. Built to survive a viral moment without hammering anyone.
import type { Handle } from '@sveltejs/kit';
import { version } from '$app/environment';

import { allowed, tooMany, type Limiter } from '$lib/server/limits';

const ID = /^[RW]\d{1,12}$/;
const DAY = 60 * 60 * 24;

/** A shared comparison link: only ?a=…&b=… with valid ids, nothing else. */
function pairPage(url: URL) {
	if (url.pathname !== '/') return undefined;
	const keys = [...url.searchParams.keys()];
	const a = url.searchParams.get('a');
	const b = url.searchParams.get('b');
	if (keys.length !== 2 || !a || !b || !ID.test(a) || !ID.test(b)) return undefined;
	return { a, b };
}

const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'X-Frame-Options': 'SAMEORIGIN',
	'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=()'
};

export const handle: Handle = async ({ event, resolve }) => {
	const { url, platform, request } = event;
	const env = platform?.env as { API_LIMITER?: Limiter } | undefined;

	// 1. API: per-IP limit (60/min) so scripts can't hammer the free services through us.
	if (url.pathname.startsWith('/api/') && !(await allowed(env?.API_LIMITER, event.getClientAddress()))) return tooMany();

	// 2. Shared comparison pages render once per data centre per deploy.
	const pair = request.method === 'GET' ? pairPage(url) : undefined;
	const cache = platform?.caches?.default;
	const key = pair && new Request(`${url.origin}/__page/${version}/${pair.a}-${pair.b}`);
	if (key && cache) {
		const hit = await cache.match(key).catch(() => undefined);
		if (hit) return hit;
	}

	// Copy first: responses served from the cache have read-only headers.
	const resolved = await resolve(event);
	const response = new Response(resolved.body, resolved);
	for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);

	if (key && cache && response.status === 200 && !response.headers.has('set-cookie')) {
		const stored = new Response(response.clone().body, response);
		stored.headers.set('Cache-Control', `public, max-age=300, s-maxage=${DAY}`);
		platform?.context?.waitUntil(cache.put(key, stored).catch(() => {}));
	}
	return response;
};
