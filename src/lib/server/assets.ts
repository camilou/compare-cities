import type { RequestEvent } from '@sveltejs/kit';
import { getCity } from './city';
import type { City } from '$lib/types';

/** Fetch one of our own static files (Workers assets binding in production, Vite in dev). */
export async function asset(event: Pick<RequestEvent, 'url' | 'platform' | 'fetch'>, path: string) {
	const assets = (event.platform?.env as { ASSETS?: Fetcher } | undefined)?.ASSETS;
	const viaBinding = assets ? await assets.fetch(new URL(path, event.url)).catch(() => undefined) : undefined;
	if (viaBinding?.ok) return viaBinding;
	// Dev (Vite serves /static) or no binding.
	const res = await event.fetch(path);
	return res.ok ? res : undefined;
}

/** A city from the static cache only (cheap: no upstream calls, ever). */
export async function cachedCity(event: Pick<RequestEvent, 'url' | 'platform' | 'fetch'>, id: string): Promise<City | undefined> {
	if (!/^[RWN]\d{1,12}$/.test(id)) return undefined;
	const res = await asset(event, `/cities/${id}.json`).catch(() => undefined);
	return res ? ((await res.json()) as City) : undefined;
}

/** A city from the static cache if we have it, otherwise looked up live. */
export async function loadCity(event: Pick<RequestEvent, 'url' | 'platform' | 'fetch'>, id: string): Promise<City> {
	if (!/^[RWN]\d{1,12}$/.test(id)) throw new Error('Bad id');
	return (await cachedCity(event, id)) ?? getCity(id, null, event.platform);
}
