import { error } from '@sveltejs/kit';
import { cachedJson } from './upstream';
import type { City, CityFacts, Area } from '$lib/types';

interface NominatimPlace {
	osm_type: string;
	osm_id: number;
	lat: string;
	lon: string;
	name: string;
	display_name: string;
	geojson: { type: string; coordinates: unknown };
	address?: Record<string, string>;
	extratags?: Record<string, string>;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
// ~50 m simplification keeps shapes faithful while payloads stay small.
const POLY = 'polygon_geojson=1&polygon_threshold=0.0005&extratags=1&addressdetails=1&format=jsonv2&accept-language=en';

const isArea = (g: NominatimPlace['geojson']) => g?.type === 'Polygon' || g?.type === 'MultiPolygon';

async function findPlace(id: string | null, q: string | null, platform: App.Platform | undefined) {
	if (id) {
		if (!/^[RWN]\d{1,12}$/.test(id)) error(400, 'Bad id');
		const [place] = await cachedJson<NominatimPlace[]>(`${NOMINATIM}/lookup?osm_ids=${id}&${POLY}`, platform, 60 * 60 * 24 * 30);
		if (place && isArea(place.geojson)) return place;
		if (!place) error(404, 'City not found');
		q = [place.name, place.address?.country].filter(Boolean).join(', ');
	}
	if (!q || q.length > 100) error(400, 'Missing city');
	const results = await cachedJson<NominatimPlace[]>(
		`${NOMINATIM}/search?q=${encodeURIComponent(q)}&limit=5&featureType=settlement&${POLY}`,
		platform,
		60 * 60 * 24 * 30
	);
	const place = results.find((r) => isArea(r.geojson));
	if (!place) error(404, `No city boundary found for “${q}”`);
	return place;
}

// ---- Wikidata -------------------------------------------------------------

type Claim = {
	rank: string;
	mainsnak: { datavalue?: { value: any } };
	qualifiers?: Record<string, { datavalue?: { value: any } }[]>;
};
type Entity = { claims: Record<string, Claim[]>; labels?: Record<string, { value: string }>; sitelinks?: Record<string, { title: string }> };

const UNITS_KM2: Record<string, number> = {
	Q712226: 1, // square kilometre
	Q25343: 1e-6, // square metre
	Q35852: 0.01, // hectare
	Q232291: 2.589988 // square mile
};

const qualYear = (c: Claim, p: string) => {
	const t = c.qualifiers?.[p]?.[0]?.datavalue?.value?.time as string | undefined;
	return t ? parseInt(t.slice(0, 5), 10) : undefined;
};

/** Pick the preferred claim, else the most recent one by "point in time". */
function best(claims: Claim[] | undefined) {
	if (!claims?.length) return undefined;
	const usable = claims.filter((c) => c.rank !== 'deprecated' && c.mainsnak.datavalue);
	const preferred = usable.filter((c) => c.rank === 'preferred');
	const pool = preferred.length ? preferred : usable;
	return [...pool].sort((a, b) => (qualYear(b, 'P585') ?? 0) - (qualYear(a, 'P585') ?? 0))[0];
}

function parseFounded(time: string, precision: number) {
	const year = parseInt(time.slice(0, time.indexOf('-', 1)), 10);
	const abs = Math.abs(year);
	if (precision <= 7) {
		const c = Math.ceil(abs / 100);
		const suffix = c % 10 === 1 && c !== 11 ? 'st' : c % 10 === 2 && c !== 12 ? 'nd' : c % 10 === 3 && c !== 13 ? 'rd' : 'th';
		return { year, label: `${c}${suffix} century${year < 0 ? ' BC' : ''}` };
	}
	return { year, label: year < 0 ? `${abs} BC` : String(year) };
}

async function wikidata(qid: string, platform: App.Platform | undefined) {
	const api = 'https://www.wikidata.org/w/api.php?format=json&action=wbgetentities';
	const { entities } = await cachedJson<{ entities: Record<string, Entity> }>(
		`${api}&ids=${qid}&props=claims|sitelinks&sitefilter=enwiki`,
		platform
	);
	const e = entities[qid];
	if (!e) return { qid, facts: {} as CityFacts, twins: [] as string[], wiki: undefined };
	const c = e.claims ?? {};
	const facts: CityFacts = {};

	const pop = best(c.P1082);
	if (pop) facts.population = { value: Number(pop.mainsnak.datavalue!.value.amount), year: qualYear(pop, 'P585') };

	const inc = best(c.P571);
	if (inc) facts.founded = parseFounded(inc.mainsnak.datavalue!.value.time, inc.mainsnak.datavalue!.value.precision);

	const elev = best(c.P2044);
	if (elev) facts.elevation = Math.round(Number(elev.mainsnak.datavalue!.value.amount));

	const area = best(c.P2046);
	if (area) {
		const { amount, unit } = area.mainsnak.datavalue!.value;
		const factor = UNITS_KM2[String(unit).split('/').pop()!];
		if (factor) facts.officialArea = Number(amount) * factor;
	}

	const nick = c.P1449?.find((x) => x.mainsnak.datavalue?.value?.language === 'en');
	if (nick) facts.nickname = nick.mainsnak.datavalue!.value.text;

	const site = best(c.P856);
	if (site) facts.website = site.mainsnak.datavalue!.value;

	const mayorId = best(c.P6)?.mainsnak.datavalue?.value?.id as string | undefined;
	if (mayorId) {
		const res = await cachedJson<{ entities: Record<string, Entity> }>(
			`${api}&ids=${mayorId}&props=labels&languages=en`,
			platform
		).catch(() => null);
		facts.mayor = res?.entities[mayorId]?.labels?.en?.value;
	}

	const twins = (c.P190 ?? []).map((x) => x.mainsnak.datavalue?.value?.id).filter(Boolean) as string[];
	return { qid, facts, twins, wiki: e.sitelinks?.enwiki?.title };
}

async function wikipedia(title: string, platform: App.Platform | undefined) {
	type Summary = {
		type: string;
		extract: string;
		wikibase_item?: string;
		coordinates?: { lat: number; lon: number };
		thumbnail?: { source: string };
		content_urls: { desktop: { page: string } };
	};
	const s = await cachedJson<Summary>(
		`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
		platform
	);
	return {
		type: s.type,
		qid: s.wikibase_item,
		coords: s.coordinates,
		summary: { extract: s.extract, image: s.thumbnail?.source, url: s.content_urls.desktop.page }
	};
}

const near = (c: { lat: number; lon: number } | undefined, lat: number, lon: number) =>
	!!c && Math.abs(c.lat - lat) < 0.6 && Math.abs(c.lon - lon) < 0.6 / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);

// ---- Handler ----------------------------------------------------------------

/**
 * The name people actually use. Wikipedia's title wins when it's the same name with
 * accents ("Bogota" → "Bogotá") or a shorter form inside the official one
 * ("Special Capital Region of Jakarta" → "Jakarta", "Guangzhou City" → "Guangzhou").
 * "Mexico City" and "New York" are left alone.
 */
export function displayName(official: string, wikiTitle?: string) {
	if (!wikiTitle) return official;
	const title = wikiTitle.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '').trim();
	const plain = (t: string) => ` ${t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()} `;
	return plain(official).includes(plain(title).trimEnd() + ' ') && title.length <= official.length ? title : official;
}

export async function getCity(id: string | null, q: string | null, platform: App.Platform | undefined): Promise<City> {
	const place = await findPlace(id, q, platform);
	const tags = place.extratags ?? {};
	const qid = tags.wikidata;

	const lat = Number(place.lat);
	const lon = Number(place.lon);

	let wd = qid ? await wikidata(qid, platform).catch(() => null) : null;
	let wikiTitle = wd?.wiki;

	// Some OSM boundaries link to the wrong Wikidata item (Bogotá's points at a list
	// article). If facts look thin, find the city's English Wikipedia article by name
	// and, if it sits in the same place, use the Wikidata item behind it instead.
	if (!wd?.facts.population || !wd?.facts.founded) {
		const wp = await wikipedia(place.name, platform).catch(() => null);
		if (wp?.type === 'standard' && wp.qid && wp.qid !== qid && near(wp.coords, lat, lon)) {
			const alt = await wikidata(wp.qid, platform).catch(() => null);
			if (alt && Object.keys(alt.facts).length > Object.keys(wd?.facts ?? {}).length) {
				wd = alt;
				wikiTitle = alt.wiki;
			}
		}
	}

	const facts: CityFacts = wd?.facts ?? {};
	if (!facts.population && tags.population) facts.population = { value: Number(tags.population.replace(/\D/g, '')) };

	wikiTitle ??= tags.wikipedia?.startsWith('en:') ? tags.wikipedia.slice(3) : undefined;
	const summary = wikiTitle ? (await wikipedia(wikiTitle, platform).catch(() => undefined))?.summary : undefined;

	const name = displayName(place.name, wikiTitle);

	return {
		id: `${place.osm_type[0].toUpperCase()}${place.osm_id}`,
		name,
		displayName: place.display_name,
		countryCode: (place.address?.country_code ?? '').toUpperCase(),
		country: place.address?.country ?? '',
		center: [lon, lat],
		geometry: place.geojson as Area,
		wikidata: wd?.qid ?? qid,
		facts,
		summary,
		twins: wd?.twins ?? []
	};
}
