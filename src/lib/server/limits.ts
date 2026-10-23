// Per-IP rate limiting with the Workers Rate Limiting API (bindings in wrangler.jsonc).
export type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export function tooMany() {
	return new Response(JSON.stringify({ message: 'Too many requests. Give it a minute and try again.' }), {
		status: 429,
		headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
	});
}

/** True when this IP is still within the limit (or no limiter is configured, e.g. in dev). */
export async function allowed(limiter: Limiter | undefined, ip: string) {
	if (!limiter) return true;
	try {
		return (await limiter.limit({ key: ip })).success;
	} catch (e) {
		console.warn('rate limiter unavailable, letting the request through:', e);
		return true;
	}
}
