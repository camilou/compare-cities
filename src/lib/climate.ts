// Monthly climate normals (2001–2020) from NASA POWER, one small request per city.
// POWER's grid is coarse (~50 km), so temperatures are corrected from the grid
// cell's mean elevation to the city's own elevation with the standard lapse rate.

export interface Climate {
	temp: number[]; // mean °C per month
	rain: number[]; // mm per month
	cloud: number[]; // mean % of sky covered by cloud
}

export const CLIMATE_SOURCE = 'NASA POWER monthly averages 2001–2020, adjusted for elevation';
const LAPSE = 0.0065; // °C per metre
const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

async function elevationAt(lat: number, lng: number, signal?: AbortSignal) {
	const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { signal });
	const d = (await res.json()) as { elevation?: number[] };
	return d.elevation?.[0];
}

/** Fetch monthly normals. `elevation` is the city's own height in metres, if known. */
export async function fetchClimate(
	[lng, lat]: [number, number],
	elevation?: number,
	signal?: AbortSignal
): Promise<Climate> {
	const url =
		`https://power.larc.nasa.gov/api/temporal/climatology/point?community=RE&format=JSON` +
		`&parameters=T2M,PRECTOTCORR,CLOUD_AMT&latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`;
	const [res, elev] = await Promise.all([
		fetch(url, { signal }),
		elevation ?? elevationAt(lat, lng, signal).catch(() => undefined)
	]);
	if (!res.ok) throw new Error('Climate data is unavailable right now.');
	const d = (await res.json()) as {
		geometry: { coordinates: number[] };
		properties: { parameter: Record<'T2M' | 'PRECTOTCORR' | 'CLOUD_AMT', Record<string, number>> };
	};
	const p = d.properties.parameter;
	const cellElev = d.geometry.coordinates[2];
	const shift = elev != null && cellElev != null ? -LAPSE * (elev - cellElev) : 0;
	const r1 = (n: number) => Math.round(n * 10) / 10;
	return {
		temp: KEYS.map((k) => r1(p.T2M[k] + shift)),
		rain: KEYS.map((k, i) => Math.round(Math.max(0, p.PRECTOTCORR[k]) * DAYS[i])),
		cloud: KEYS.map((k) => Math.round(p.CLOUD_AMT[k]))
	};
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => sum(xs) / xs.length;
