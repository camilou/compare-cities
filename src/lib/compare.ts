import data from './data/countries.json';
import type { City } from './types';
import { distanceKm, spanKm } from './geo';
import type { Area } from './types';
import type { GreenStats, TransitStats } from './osm';
import { mean, sum, MONTHS, type Climate } from './climate';

export type Country = (typeof data.countries)[keyof typeof data.countries];
export const countryOf = (c: City): Country | undefined =>
	(data.countries as Record<string, Country>)[c.countryCode];
export const dataUpdated = data.updated;
export const bigMacDate = data.bigMacUsd.date;

const HOURS_PER_MONTH = 173; // 40 h × 52 weeks / 12
const PITCH_KM2 = 0.00714; // FIFA-size football pitch, 105 × 68 m
const CAR_LENGTH_M = 4.5;

export interface Side {
	city: City;
	shape: Area; // as drawn on the map (remote islands dropped)
	areaKm2: number;
	weather?: Weather;
	transit?: TransitStats;
	green?: GreenStats;
	climate?: Climate;
}

/** Which slow lookups are still running for a side. */
export type Pending = Partial<Record<'transit' | 'green' | 'climate', boolean>>;

export interface Weather {
	tempC: number;
	code: number;
	timezone: string;
	utcOffset: number; // seconds
}

export interface Derived {
	population?: number;
	density?: number;
	ageYears?: number;
	bigMacUsd?: number;
	bigMacLocal?: string;
	bigMacMinutes?: number;
	cars?: number;
	carsPer1000?: number;
	gdp?: number;
	life?: number;
	acrossKm: number;
	parkM2PerPerson?: number;
	bikePer100k?: number;
}

const year = new Date().getFullYear();

export function derive(s: Side): Derived {
	const c = countryOf(s.city);
	const population = s.city.facts.population?.value;
	const mac = c?.bigMac;
	const hourly = c?.netSalaryUsd ? c.netSalaryUsd / HOURS_PER_MONTH : undefined;
	return {
		population,
		density: population ? population / s.areaKm2 : undefined,
		ageYears: s.city.facts.founded ? year - s.city.facts.founded.year : undefined,
		bigMacUsd: mac?.usd,
		bigMacLocal: mac ? money(mac.local, mac.currency) : undefined,
		bigMacMinutes: mac && hourly ? (mac.usd / hourly) * 60 : undefined,
		cars: population && c?.carsPer1000 ? (population * c.carsPer1000) / 1000 : undefined,
		carsPer1000: c?.carsPer1000 ?? undefined,
		gdp: c?.gdpPerCapita?.value,
		life: c?.lifeExpectancy?.value,
		acrossKm: spanKm(s.shape, s.city.center),
		parkM2PerPerson: s.green && population ? (s.green.parksKm2 * 1e6) / population : undefined,
		bikePer100k: s.transit && population ? (s.transit.bikeKm / population) * 1e5 : undefined
	};
}

// ---- Formatting ---------------------------------------------------------------

const nf = (max = 0) => new Intl.NumberFormat('en', { maximumFractionDigits: max });
export const num = (n: number, max = 0) => nf(max).format(n);
export const compact = (n: number) =>
	n >= 1e6 ? `${nf(1).format(n / 1e6)}M` : n >= 1e4 ? `${nf(0).format(n / 1e3)}k` : nf(0).format(n);
export const km2 = (n: number) => `${num(n, n < 10 ? 1 : 0)} km²`;
export const usd = (n: number, max = 2) =>
	new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: max }).format(n);
export function money(n: number, currency: string) {
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: n > 100 ? 0 : 2 }).format(n);
	} catch {
		return `${num(n, 2)} ${currency}`;
	}
}
export const minutes = (m: number) => (m < 90 ? `${num(m)} min` : `${num(m / 60, 1)} h`);

// ---- Rows ----------------------------------------------------------------------

export interface Row {
	key: string;
	group: string;
	label: string;
	pending?: boolean;
	note?: string;
	a?: number;
	b?: number;
	fmtA?: string;
	fmtB?: string;
}

let group = '';
function row(key: string, label: string, a: number | undefined, b: number | undefined, fmt: (n: number) => string, note?: string): Row {
	return { key, group, label, note, a, b, fmtA: a != null ? fmt(a) : undefined, fmtB: b != null ? fmt(b) : undefined };
}

export function rows(A: Side, B: Side, dA: Derived, dB: Derived, pending: { a: Pending; b: Pending }): Row[] {
	const fa = A.city.facts;
	const fb = B.city.facts;
	const popYear = [fa.population?.year, fb.population?.year].filter(Boolean).join(' / ');
	const waiting = (k: keyof Pending) => !!(pending.a[k] || pending.b[k]);
	const out: Row[] = [];
	const add = (r: Row, k?: keyof Pending) => out.push(k && waiting(k) ? { ...r, pending: true } : r);

	group = 'People and place';
	add(row('area', 'Area', A.areaKm2, B.areaKm2, km2, 'Measured from the outline on the map'));
	add(row('population', 'Population', dA.population, dB.population, compact, popYear ? `Wikidata, ${popYear}` : 'Wikidata'));
	add(row('density', 'People per km²', dA.density, dB.density, (n) => num(n), 'Population ÷ area'));
	const founded = row('founded', 'Founded', dA.ageYears, dB.ageYears, (n) => `${num(n)} yrs ago`, 'Wikidata');
	founded.fmtA = fa.founded?.label;
	founded.fmtB = fb.founded?.label;
	add(founded);
	add(row('elevation', 'Elevation', fa.elevation, fb.elevation, (n) => `${num(n)} m`, 'Above sea level'));
	add(row('across', 'Widest span', dA.acrossKm, dB.acrossKm, (n) => `${num(n)} km`, 'Across the outline, through its centre'));

	group = 'Getting around';
	const tA = A.transit;
	const tB = B.transit;
	add(row('lines', 'Metro and light-rail lines', tA?.lines, tB?.lines, (n) => num(n), 'OpenStreetMap'), 'transit');
	add(row('stations', 'Metro stations', tA?.stations, tB?.stations, (n) => num(n), 'OpenStreetMap'), 'transit');
	add(row('metro', 'Metro track', tA?.metroKm, tB?.metroKm, (n) => `${num(n)} km`, 'Both directions counted where mapped separately'), 'transit');
	if ((tA?.buswayKm ?? 0) + (tB?.buswayKm ?? 0) > 2)
		add(row('busway', 'Bus-only roads', tA?.buswayKm, tB?.buswayKm, (n) => `${num(n)} km`, 'BRT corridors mapped as busways'), 'transit');
	add(row('bike', 'Bike lanes and paths', tA?.bikeKm, tB?.bikeKm, (n) => `${num(n)} km`, 'OpenStreetMap'), 'transit');
	add(row('bikepc', 'Bike lanes per 100k people', dA.bikePer100k, dB.bikePer100k, (n) => `${num(n, 1)} km`), 'transit');
	add(row('cars', 'Cars', dA.cars, dB.cars, (n) => `≈ ${compact(n)}`, 'Estimated: population × national cars per person'));
	add(row('carsrate', 'Cars per 1,000 people', dA.carsPer1000, dB.carsPer1000, (n) => num(n), 'National, approximate'));

	group = 'Green and climate';
	add(row('parks', 'Parks and gardens', A.green?.parksPct, B.green?.parksPct, (n) => `${num(n, 1)}%`, 'Share of the city area'), 'green');
	add(row('green', 'All green space', A.green?.greenPct, B.green?.greenPct, (n) => `${num(n, 1)}%`, 'Parks plus forest, grass and scrub'), 'green');
	add(row('parkpp', 'Park space per person', dA.parkM2PerPerson, dB.parkM2PerPerson, (n) => `${num(n)} m²`, 'WHO suggests at least 9 m²'), 'green');
	const cA = A.climate;
	const cB = B.climate;
	add(row('temp', 'Average temperature', cA && mean(cA.temp), cB && mean(cB.temp), (n) => `${num(n, 1)} °C`, 'Yearly mean'), 'climate');
	add(row('rain', 'Rain per year', cA && sum(cA.rain), cB && sum(cB.rain), (n) => `${num(n)} mm`), 'climate');
	add(row('cloud', 'Cloud cover', cA && mean(cA.cloud), cB && mean(cB.cloud), (n) => `${num(n)}%`, 'Average share of sky covered'), 'climate');

	group = 'Money and life';
	add(row('bigmac', 'Big Mac price', dA.bigMacUsd, dB.bigMacUsd, (n) => usd(n), `National price, The Economist ${bigMacDate.slice(0, 7)}`));
	add(row('bigmacwork', 'Work time for one Big Mac', dA.bigMacMinutes, dB.bigMacMinutes, minutes, 'At an average net salary, estimated'));
	add(row('gdp', 'GDP per person', dA.gdp, dB.gdp, (n) => usd(n, 0), 'National, World Bank'));
	add(row('life', 'Life expectancy', dA.life, dB.life, (n) => `${num(n, 1)} yrs`, 'National, World Bank'));

	return out.filter((r) => r.pending || r.a != null || r.b != null);
}

// ---- Fun facts --------------------------------------------------------------------

export interface Fact {
	icon: string;
	text: string;
}

const name = (s: Side) => s.city.name;

export function funFacts(A: Side, B: Side, dA: Derived, dB: Derived): Fact[] {
	const out: Fact[] = [];
	const a = name(A);
	const b = name(B);

	const apart = distanceKm(A.city.center, B.city.center);
	if (apart > 50)
		out.push({
			icon: '✈️',
			text: `${a} and ${b} are ${num(apart)} km apart, roughly ${num(Math.max(1, apart / 800), 1)} hours by plane.`
		});

	if (A.city.twins?.includes(B.city.wikidata ?? '-') || B.city.twins?.includes(A.city.wikidata ?? '-'))
		out.push({ icon: '💞', text: `${a} and ${b} are officially twinned sister cities.` });

	if (dA.population && dB.density) {
		const hyp = A.areaKm2 * dB.density;
		out.push({
			icon: '🏙️',
			text: `Packed as densely as ${b}, ${a} would be home to ${compact(hyp)} people instead of ${compact(dA.population)}.`
		});
	}

	out.push({
		icon: '⚽',
		text: `${b} covers about ${compact(B.areaKm2 / PITCH_KM2)} football pitches; ${a} covers ${compact(A.areaKm2 / PITCH_KM2)}.`
	});

	if (dA.density && dB.density)
		out.push({
			icon: '🧍',
			text: `On one football pitch of land there are, on average, ${num(dA.density * PITCH_KM2)} people in ${a} and ${num(dB.density * PITCH_KM2)} in ${b}.`
		});

	out.push({
		icon: '🚶',
		text: `Walking straight across ${a} takes about ${hours(dA.acrossKm / 5)}; across ${b}, ${hours(dB.acrossKm / 5)}.`
	});

	const elA = A.city.facts.elevation;
	const elB = B.city.facts.elevation;
	if (elA != null && elB != null && Math.abs(elA - elB) > 400) {
		const [hi, lo, el] = elA > elB ? [a, b, elA] : [b, a, elB];
		out.push({
			icon: '🫖',
			text: `${hi} sits ${num(Math.abs(elA - elB))} m higher than ${lo}, so water boils there at about ${num(100 - el / 300)} °C.`
		});
	}

	const yA = A.city.facts.founded?.year;
	const yB = B.city.facts.founded?.year;
	if (yA != null && yB != null && Math.abs(yA - yB) >= 30) {
		const [old, young] = yA < yB ? [a, b] : [b, a];
		out.push({ icon: '🏛️', text: `${old} was already ${num(Math.abs(yA - yB))} years old when ${young} was founded.` });
	}

	if (dA.bigMacMinutes && dB.bigMacMinutes) {
		out.push({
			icon: '🍔',
			text: `One hour of work buys about ${num(60 / dA.bigMacMinutes, 1)} Big Macs in ${a} and ${num(60 / dB.bigMacMinutes, 1)} in ${b}.`
		});
	}

	if (dA.cars && dA.cars > 1000) {
		const km = (dA.cars * CAR_LENGTH_M) / 1000;
		out.push({
			icon: '🚗',
			text: `Parked bumper to bumper, ${a}’s ≈${compact(dA.cars)} cars would form a line ${num(km)} km long${
				km > apart && apart > 50 ? `, long enough to reach ${b}` : ''
			}.`
		});
	}

	if (A.weather && B.weather) {
		const diffH = (B.weather.utcOffset - A.weather.utcOffset) / 3600;
		if (diffH !== 0)
			out.push({
				icon: '🕰️',
				text: `${b} is ${num(Math.abs(diffH), 1)} hour${Math.abs(diffH) === 1 ? '' : 's'} ${diffH > 0 ? 'ahead of' : 'behind'} ${a}.`
			});
	}

	const tA = A.transit;
	const tB = B.transit;
	if (tA && tB && (tA.stations || tB.stations)) {
		if (!tA.stations || !tB.stations) {
			const [has, hasnt] = tA.stations ? [A, B] : [B, A];
			out.push({ icon: '🚇', text: `${name(has)} has ${num((has.transit as TransitStats).stations)} metro stations; ${name(hasnt)} has none on the map yet.` });
		} else {
			out.push({
				icon: '🚇',
				text: `There is one metro station for every ${num(A.areaKm2 / tA.stations, 1)} km² in ${a}, and one for every ${num(B.areaKm2 / tB.stations, 1)} km² in ${b}.`
			});
		}
	}
	const bikest = [A, B].filter((s) => (s.transit?.bikeKm ?? 0) > 20).sort((x, y) => y.transit!.bikeKm - x.transit!.bikeKm)[0];
	if (bikest)
		out.push({
			icon: '🚲',
			text: `Riding every bike lane in ${name(bikest)} at 15 km/h would take ${hours(bikest.transit!.bikeKm / 15)}.`
		});

	if (A.green && B.green) {
		const [g, other] = A.green.greenPct >= B.green.greenPct ? [A, B] : [B, A];
		out.push({
			icon: '🌳',
			text: `${num(g.green!.greenPct)}% of ${name(g)} is green space, compared with ${num(other.green!.greenPct)}% of ${name(other)}.`
		});
	}

	if (A.climate && B.climate) {
		const swing = (c: Climate) => Math.max(...c.temp) - Math.min(...c.temp);
		const [steady, wild] = swing(A.climate) <= swing(B.climate) ? [A, B] : [B, A];
		out.push({
			icon: '🌡️',
			text: `${name(steady)}’s warmest and coldest months differ by ${num(swing(steady.climate!), 1)} °C; in ${name(wild)} the gap is ${num(swing(wild.climate!), 1)} °C.`
		});
		const clearest = (c: Climate) => MONTHS[c.cloud.indexOf(Math.min(...c.cloud))];
		const [clear, grey] = mean(A.climate.cloud) <= mean(B.climate.cloud) ? [A, B] : [B, A];
		out.push({
			icon: '☀️',
			text: `${name(clear)} has the clearer skies: ${num(mean(clear.climate!.cloud))}% average cloud cover against ${num(mean(grey.climate!.cloud))}% in ${name(grey)}. Its clearest month is ${clearest(clear.climate!)}.`
		});
		const wettest = (c: Climate) => MONTHS[c.rain.indexOf(Math.max(...c.rain))];
		out.push({ icon: '☔', text: `Pack an umbrella in ${wettest(A.climate)} for ${a} and in ${wettest(B.climate)} for ${b}: their rainiest months.` });
	}

	for (const s of [A, B])
		if (s.city.facts.nickname) out.push({ icon: '🏷️', text: `${name(s)} is nicknamed “${s.city.facts.nickname}”.` });

	return out;
}

function hours(h: number) {
	if (h < 1) return `${num(h * 60)} minutes`;
	return `${num(h, h < 10 ? 1 : 0)} hours`;
}

const WMO: Record<number, string> = {
	0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌦️',
	61: '🌧️', 63: '🌧️', 65: '🌧️', 71: '🌨️', 73: '🌨️', 75: '❄️', 80: '🌦️', 81: '🌧️', 82: '⛈️', 95: '⛈️', 96: '⛈️', 99: '⛈️'
};
export const weatherIcon = (code: number) => WMO[code] ?? '🌡️';

export async function fetchWeather([lng, lat]: [number, number]): Promise<Weather | undefined> {
	try {
		const res = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
		);
		const d = (await res.json()) as {
			current: { temperature_2m: number; weather_code: number };
			timezone: string;
			utc_offset_seconds: number;
		};
		return { tempC: d.current.temperature_2m, code: d.current.weather_code, timezone: d.timezone, utcOffset: d.utc_offset_seconds };
	} catch {
		return undefined;
	}
}
