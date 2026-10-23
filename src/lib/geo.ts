import turfArea from '@turf/area';
import type { Position } from 'geojson';
import type { Area } from './types';

const R = 6371008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type LngLat = [number, number];

/** Great-circle distance (m) and initial bearing (rad) from a to b. */
function polar(a: LngLat, b: Position): [number, number] {
	const φ1 = rad(a[1]);
	const φ2 = rad(b[1]);
	const Δλ = rad(b[0] - a[0]);
	const h = Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
	const dist = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
	const bearing = Math.atan2(
		Math.sin(Δλ) * Math.cos(φ2),
		Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
	);
	return [dist, bearing];
}

/** Point reached by travelling `dist` metres from `o` along `bearing` (rad). */
function destination(o: LngLat, dist: number, bearing: number): Position {
	const φ1 = rad(o[1]);
	const λ1 = rad(o[0]);
	const δ = dist / R;
	const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearing));
	const λ2 = λ1 + Math.atan2(Math.sin(bearing) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
	return [((deg(λ2) + 540) % 360) - 180, deg(φ2)];
}

export const distanceKm = (a: LngLat, b: LngLat) => polar(a, b)[0] / 1000;

const mapCoords = (g: Area, fn: (p: Position) => Position): Area =>
	g.type === 'Polygon'
		? { type: 'Polygon', coordinates: g.coordinates.map((ring) => ring.map(fn)) }
		: { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map((ring) => ring.map(fn))) };

/**
 * Move a shape to a new place on the globe keeping its real size and shape.
 *
 * Every vertex keeps its true ground distance and compass bearing from the
 * shape's anchor, re-measured from the new anchor. This is what makes the
 * overlay honest on a Mercator map: a city moved towards the poles will look
 * bigger on screen, exactly like everything else around it does.
 */
export function transplant(g: Area, from: LngLat, to: LngLat, rotationDeg = 0): Area {
	const rot = rad(rotationDeg);
	return mapCoords(g, (p) => {
		const [d, b] = polar(from, p);
		return destination(to, d, b + rot);
	});
}

/**
 * Drop far-away islands and exclaves so the comparison stays about the city:
 * anything over 80 km out (Tokyo's Ogasawara islands), and specks under 1% of the
 * main area more than 15 km out (San Francisco's Farallon Islands).
 */
export function mainland(g: Area, center: LngLat, maxKm = 80): Area {
	if (g.type !== 'MultiPolygon') return g;
	const nearest = (poly: Position[][]) => Math.min(...poly[0].map((p) => polar(center, p)[0] / 1000));
	const size = (poly: Position[][]) => areaKm2({ type: 'Polygon', coordinates: poly });
	const biggest = Math.max(...g.coordinates.map(size));
	const keep = g.coordinates.filter((poly) => {
		const d = nearest(poly);
		return d <= maxKm && !(d > 15 && size(poly) < biggest * 0.01);
	});
	return keep.length ? { type: 'MultiPolygon', coordinates: keep } : g;
}

export const areaKm2 = (g: Area) => turfArea({ type: 'Feature', properties: {}, geometry: g }) / 1e6;

export function bbox(...gs: Area[]): [LngLat, LngLat] {
	let [w, s, e, n] = [180, 90, -180, -90];
	for (const g of gs)
		mapCoords(g, (p) => {
			w = Math.min(w, p[0]);
			e = Math.max(e, p[0]);
			s = Math.min(s, p[1]);
			n = Math.max(n, p[1]);
			return p;
		});
	return [
		[w, s],
		[e, n]
	];
}

/** Widest extent of a shape in km (max distance between any vertex and the anchor, doubled is a fair "across"). */
export function spanKm(g: Area, center: LngLat) {
	let max = 0;
	mapCoords(g, (p) => {
		max = Math.max(max, polar(center, p)[0]);
		return p;
	});
	return (max * 2) / 1000;
}
