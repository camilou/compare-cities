// Builds src/lib/data/countries.json from free public sources.
// Run with `npm run data` whenever you want fresher numbers.
import { writeFileSync } from 'node:fs';

const OUT = new URL('../src/lib/data/countries.json', import.meta.url);
const BIGMAC_CSV =
	'https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/source-data/big-mac-source-data-v2.csv';
const WB = 'https://api.worldbank.org/v2';

// Passenger cars per 1,000 people, national, rounded. Compiled from OICA /
// Eurostat / national registries (~2021-2024). Approximate by design.
const CARS_PER_1000 = {
	US: 800, CA: 640, MX: 280, BR: 280, AR: 300, CL: 280, CO: 120, PE: 80, UY: 300, EC: 100,
	VE: 120, BO: 80, PY: 150, CR: 220, GT: 100, HN: 80, NI: 50, PA: 200, DO: 150, CU: 40,
	GB: 490, IE: 450, FR: 570, DE: 583, ES: 527, PT: 560, IT: 684, NL: 522, BE: 512, LU: 681,
	AT: 562, CH: 540, DK: 470, SE: 485, NO: 520, FI: 658, IS: 800, PL: 687, CZ: 600, SK: 450,
	HU: 410, RO: 410, BG: 450, GR: 520, HR: 450, SI: 560, EE: 650, LV: 400, LT: 550, UA: 230,
	MD: 200, RU: 320, TR: 180, IL: 380, JO: 150, LB: 350, AE: 300, SA: 220, QA: 450, KW: 500,
	BH: 400, OM: 300, EG: 50, MA: 80, ZA: 120, NG: 30, KE: 25, AZ: 140, PK: 18, IN: 35,
	CN: 230, JP: 495, KR: 400, TW: 300, HK: 85, SG: 110, MY: 470, TH: 160, VN: 25, ID: 65,
	PH: 40, AU: 580, NZ: 700
};

// Average net monthly salary in USD, ~2025, rounded. Hand-compiled estimate
// (ILOSTAT blocks scripted downloads); used only for "minutes of work per Big Mac".
const NET_SALARY_USD = {
	ARE: 3500, ARG: 700, AUS: 4200, AUT: 2900, AZE: 450, BEL: 3000, BGR: 1100, BHR: 1700, BRA: 500,
	CAN: 3500, CHE: 6500, CHL: 850, CHN: 1200, COL: 450, CRI: 900, CZE: 1600, DEU: 3200, DNK: 4300,
	EGY: 150, ESP: 1900, EST: 1700, FIN: 2900, FRA: 2700, GBR: 3300, GRC: 1100, GTM: 550, HKG: 2700,
	HND: 450, HRV: 1400, HUN: 1200, IDN: 300, IND: 450, IRL: 3600, ISR: 3600, ITA: 1900, JOR: 600,
	JPN: 2300, KOR: 2600, KWT: 2500, LBN: 500, LTU: 1700, LVA: 1300, MDA: 600, MEX: 650, MYS: 900,
	NIC: 350, NLD: 3400, NOR: 4000, NZL: 3300, OMN: 1500, PAK: 150, PER: 500, PHL: 350, POL: 1600,
	PRT: 1300, QAT: 3500, ROU: 1100, SAU: 2200, SGP: 4500, SVK: 1400, SVN: 1800, SWE: 3100, THA: 500,
	TUR: 650, TWN: 1500, UKR: 500, URY: 1100, USA: 4500, VEN: 150, VNM: 350, ZAF: 1200,
	LUX: 5000, CYP: 1700, MLT: 1700
};

const csvSplit =(line) => line.split(',');

async function json(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
}

async function indicator(code) {
	const [, rows] = await json(`${WB}/country/all/indicator/${code}?format=json&per_page=20000&mrnev=1`);
	const map = {};
	for (const r of rows ?? []) {
		if (r.value != null) map[r.countryiso3code] = { value: r.value, year: Number(r.date) };
	}
	return map;
}

const [, countries] = await json(`${WB}/country?format=json&per_page=400`);
const [gdp, life] = await Promise.all([indicator('NY.GDP.PCAP.CD'), indicator('SP.DYN.LE00.IN')]);

const csv = await (await fetch(BIGMAC_CSV)).text();
const bigmac = {};
for (const line of csv.trim().split('\n').slice(1)) {
	const [name, iso3, currency, local, ex, , , date] = csvSplit(line);
	const price = Number(local) / Number(ex);
	if (!Number.isFinite(price)) continue;
	if (!bigmac[iso3] || bigmac[iso3].date < date) {
		bigmac[iso3] = { usd: Math.round(price * 100) / 100, local: Number(local), currency, date, name };
	}
}

const EURO = new Set(
	'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES'.split(' ')
);

const out = {};
for (const c of countries) {
	if (!c.iso2Code || c.region?.value === 'Aggregates') continue;
	const iso3 = c.id;
	const mac = bigmac[iso3] ?? (EURO.has(c.iso2Code) ? { ...bigmac.EUZ, euroArea: true } : null);
	out[c.iso2Code] = {
		iso3,
		name: c.name,
		region: c.region?.value?.trim(),
		income: c.incomeLevel?.value,
		gdpPerCapita: gdp[iso3] ?? null,
		lifeExpectancy: life[iso3] ?? null,
		bigMac: mac,
		carsPer1000: CARS_PER_1000[c.iso2Code] ?? null,
		netSalaryUsd: NET_SALARY_USD[iso3] ?? null
	};
}

const usa = bigmac.USA;
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), bigMacUsd: usa, countries: out }));
console.log(`Wrote ${Object.keys(out).length} countries. Big Mac USA ${usa.usd} (${usa.date})`);
