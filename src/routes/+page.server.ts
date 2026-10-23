import { loadCity } from '$lib/server/assets';
import { areaKm2, mainland } from '$lib/geo';
import { cardInput, headlineText } from '$lib/share/card';
import type { PageServerLoad } from './$types';

const DEFAULTS = { a: 'R7426387', b: 'R7444' }; // Bogotá, Paris
const ID = /^[RW]\d{1,12}$/;

const within = <T>(p: Promise<T>, ms: number) =>
	Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/** Title, description and preview image for link unfurls (WhatsApp, X, Slack, …). */
export const load: PageServerLoad = async (event) => {
	const a = event.url.searchParams.get('a') ?? DEFAULTS.a;
	const b = event.url.searchParams.get('b') ?? DEFAULTS.b;
	const generic = {
		title: 'Compare cities: true size and shape',
		description: 'Lay one city on top of another at its true size and shape, then compare people, transit, parks, climate and the Big Mac index.',
		image: null as string | null
	};
	if (!ID.test(a) || !ID.test(b)) return { meta: generic };

	// Cached cities answer in milliseconds; don't hold the page hostage to a slow live lookup.
	const pair = await within(Promise.all([loadCity(event, a), loadCity(event, b)]).catch(() => undefined), 2500);
	if (!pair) return { meta: generic };

	const side = (c: (typeof pair)[number]) => {
		const shape = mainland(c.geometry, c.center);
		return { name: c.name, shape, center: c.center, areaKm2: areaKm2(shape), population: c.facts.population?.value };
	};
	const card = cardInput(side(pair[0]), side(pair[1]), event.url.host);
	return {
		meta: {
			title: `${pair[0].name} vs ${pair[1].name}: true size compared`,
			description: `${headlineText(card)} See both cities overlaid at their true size, plus people, transit, parks, climate and the Big Mac index.`,
			image: `${event.url.origin}/og/${a}-${b}.png`
		}
	};
};
