// Fetch helpers for free upstream APIs: identify ourselves politely (required by
// Nominatim's usage policy) and keep responses in Cloudflare's edge cache so we
// hit them as rarely as possible.
export const USER_AGENT = 'CompareCities/1.0 (+https://compare-cities.hacer.workers.dev; https://github.com/camilou/compare-cities)';

const DAY = 60 * 60 * 24;

export async function cachedJson<T>(
	url: string,
	platform: App.Platform | undefined,
	ttl = DAY * 7
): Promise<T> {
	const cache = platform?.caches?.default;
	const key = new Request(url);
	const hit = await cache?.match(key).catch(() => undefined);
	if (hit) return hit.json() as Promise<T>;

	const init = { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'en' } };
	let res = await fetch(url, init);
	if (res.status === 429 || res.status === 503) {
		// One polite retry for burst limits (Wikidata/Nominatim), never longer than 2.5 s.
		const wait = Math.min(Number(res.headers.get('retry-after')) || 1, 2.5) * 1000;
		await new Promise((r) => setTimeout(r, wait));
		res = await fetch(url, init);
	}
	if (!res.ok) throw new Error(`Upstream ${res.status} for ${new URL(url).host}`);
	const body = await res.text();

	const put = cache?.put(
		key,
		new Response(body, {
			headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` }
		})
	);
	if (put) platform?.context?.waitUntil(put.catch(() => {}));
	return JSON.parse(body) as T;
}

export const cacheHeaders = (ttl = DAY) => ({
	'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl * 7}`
});

/** Cache any JSON-serialisable result in the edge cache under a synthetic key. */
export async function edgeCached<T>(
	key: string,
	platform: App.Platform | undefined,
	ttl: number,
	produce: () => Promise<T>
): Promise<T> {
	const cache = platform?.caches?.default;
	const req = new Request(`https://cache.compare-cities.internal/${key}`);
	const hit = await cache?.match(req).catch(() => undefined);
	if (hit) return hit.json() as Promise<T>;
	const value = await produce();
	const put = cache?.put(
		req,
		new Response(JSON.stringify(value), {
			headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` }
		})
	);
	if (put) platform?.context?.waitUntil(put.catch(() => {}));
	return value;
}
