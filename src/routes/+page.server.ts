import { cachedCity } from '$lib/server/assets';
import { areaKm2, mainland, simplifyTo } from '$lib/geo';
import { cardInput, headlineText } from '$lib/share/card';
import cityIndex from '$lib/data/city-index.json';
import type { PageServerLoad } from './$types';

// When we can't tell where a visitor is: New York vs Paris.
const DEFAULTS = { a: 'R175905', b: 'R7444' };
const SECOND_CHOICE = 'R7426387'; // Bogotá, for visitors who are already in Paris
const ID = /^[RW]\d{1,12}$/;

type Row = [id: string, name: string, cc: string, context: string, pop: number];
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export type Start = { id: string } | { q: string };

/**
 * The visitor's own city as the base map. Cloudflare already knows roughly where a
 * request comes from (request.cf), so this needs no lookup service and stores nothing.
 */
function homeCity(cf: IncomingRequestCfProperties | undefined): Start | undefined {
	const city = typeof cf?.city === 'string' ? cf.city : undefined;
	const cc = typeof cf?.country === 'string' ? cf.country : undefined;
	if (!city || !cc) return undefined;
	const hit = (cityIndex as Row[]).find((r) => r[2] === cc && fold(r[1]) === fold(city));
	if (hit) return { id: hit[0] };
	let country: string = cc;
	try {
		country = new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) ?? cc;
	} catch {
		/* keep the code */
	}
	return { q: `${city}, ${country}` };
}

const within = <T>(p: Promise<T>, ms: number) =>
	Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/** Title, description and preview image for link unfurls (WhatsApp, X, Slack, …). */
export const load: PageServerLoad = async (event) => {
	const params = event.url.searchParams;
	const home = params.get('a') ? undefined : homeCity(event.platform?.cf);
	const start = {
		a: (params.get('a') ? { id: params.get('a')! } : (home ?? { id: DEFAULTS.a })) as Start,
		b: { id: params.get('b') ?? (home && 'id' in home && home.id === DEFAULTS.b ? SECOND_CHOICE : DEFAULTS.b) } as Start
	};
	const a = 'id' in start.a ? start.a.id : DEFAULTS.a;
	const b = 'id' in start.b ? start.b.id : DEFAULTS.b;
	const generic = {
		title: 'Compare cities: every city at its true size and shape',
		description: 'Drop any city on top of another at its true size and shape, then compare people, transit, parks, climate and the Big Mac index.',
		image: `${event.url.origin}/og/default.png`,
		url: `${event.url.origin}/`
	};
	// Link previews describe what the link itself says. A bare link gets the generic
	// card: picking the visitor's city would show a crawler's data-centre city instead.
	if (!params.get('a') || !params.get('b')) return { meta: generic, start };
	if (!ID.test(a) || !ID.test(b) || !('id' in start.a)) return { meta: generic, start };

	// Previews only describe cached cities: cheap, and random ids can't trigger live lookups.
	const found = await within(Promise.all([cachedCity(event, a), cachedCity(event, b)]).catch(() => undefined), 2500);
	if (!found?.[0] || !found[1]) return { meta: generic, start };
	const pair = [found[0], found[1]] as const;

	const side = (c: (typeof pair)[number]) => {
		const shape = mainland(c.geometry, c.center);
		return { name: c.name, shape: simplifyTo(shape, 1200), center: c.center, areaKm2: areaKm2(shape), population: c.facts.population?.value };
	};
	const card = cardInput(side(pair[0]), side(pair[1]), event.url.host);
	return {
		start,
		meta: {
			title: `${pair[0].name} vs ${pair[1].name}: true size compared`,
			description: `${headlineText(card)} See both cities overlaid at their true size, plus people, transit, parks, climate and the Big Mac index.`,
			image: `${event.url.origin}/og/${a}-${b}.png`,
			url: `${event.url.origin}/?a=${a}&b=${b}`
		}
	};
};
