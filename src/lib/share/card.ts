// Builds the share image as an SVG string. The browser turns it into a PNG for
// download / native share; the server renders the same SVG for link previews.
import { transplant, type LngLat } from '../geo';
import type { Area } from '../types';

export interface CardCity {
	name: string;
	shape: Area;
	center: LngLat;
}
export interface CardStat {
	label: string;
	a: string;
	b: string;
}
export interface CardInput {
	a: CardCity;
	b: CardCity;
	/** Headline split so the city names can be inked: e.g. ["{a}", " is 3.8× the size of ", "{b}", "."] */
	headline: { text: string; ink?: 'a' | 'b' }[];
	stats: CardStat[];
	site: string;
}
export type CardFormat = 'landscape' | 'portrait';
export const CARD_SIZE: Record<CardFormat, [number, number]> = {
	landscape: [1200, 630],
	portrait: [1080, 1350]
};

const C = {
	paper: '#fbf7e4',
	card: '#ffffff',
	ink: '#2a2140',
	muted: '#6a6080',
	line: '#ece5cb',
	a: '#6a3df5',
	b: '#e5620a'
};
export const FONT = 'Bricolage Grotesque';
export const BRAND_FONT = 'Unbounded';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- Shapes -----------------------------------------------------------------------

function rings(g: Area): number[][][] {
	return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
}

function shapes(input: CardInput, x: number, y: number, w: number, h: number) {
	const home = input.a.shape;
	const guest = transplant(input.b.shape, input.b.center, input.a.center);
	const [lon0, lat0] = input.a.center;
	const k = Math.cos((lat0 * Math.PI) / 180);
	const proj = ([lon, lat]: number[]) => [(lon - lon0) * k, -(lat - lat0)];

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const r of [...rings(home), ...rings(guest)])
		for (const p of r) {
			const [px, py] = proj(p);
			minX = Math.min(minX, px), maxX = Math.max(maxX, px), minY = Math.min(minY, py), maxY = Math.max(maxY, py);
		}
	const s = Math.min(w / (maxX - minX), h / (maxY - minY)) * 0.9;
	const ox = x + w / 2 - ((minX + maxX) / 2) * s;
	const oy = y + h / 2 - ((minY + maxY) / 2) * s;

	const path = (g: Area) =>
		rings(g)
			.map((r) => {
				let d = '';
				let lx = Infinity, ly = Infinity;
				for (const p of r) {
					const [px, py] = proj(p);
					const sx = ox + px * s, sy = oy + py * s;
					if (Math.abs(sx - lx) + Math.abs(sy - ly) < 0.8) continue; // drop sub-pixel steps
					d += `${d ? 'L' : 'M'}${sx.toFixed(1)},${sy.toFixed(1)}`;
					lx = sx, ly = sy;
				}
				return d + 'Z';
			})
			.join('');

	return (
		`<path d="${path(home)}" fill="${C.a}" fill-opacity=".16" stroke="${C.a}" stroke-width="3" stroke-linejoin="round" fill-rule="evenodd"/>` +
		`<path d="${path(guest)}" fill="${C.b}" fill-opacity=".42" stroke="${C.b}" stroke-width="3" stroke-linejoin="round" fill-rule="evenodd"/>`
	);
}

// ---- Text ---------------------------------------------------------------------------

/** Rough advance width for Bricolage Grotesque (good enough for wrapping). */
const advance = (text: string, size: number, weight: number) => text.length * size * (weight >= 700 ? 0.56 : 0.5);

type Seg = { text: string; ink?: 'a' | 'b' };

/** Greedy line wrapping that only breaks after a space, so "Paris." stays together. */
function wrapInked(parts: CardInput['headline'], input: CardInput, size: number, maxW: number) {
	const words: Seg[][] = [];
	let open = false; // previous segment did not end in a space: glue onto it
	for (const p of parts) {
		const text = p.text.replace('{a}', input.a.name).replace('{b}', input.b.name);
		for (const w of text.split(/(?<= )/)) {
			if (!w) continue;
			if (open && words.length) words[words.length - 1].push({ text: w, ink: p.ink });
			else words.push([{ text: w, ink: p.ink }]);
			open = !w.endsWith(' ');
		}
	}
	const lines: Seg[][] = [[]];
	let width = 0;
	for (const word of words) {
		const ww = advance(word.map((s) => s.text).join(''), size, 800);
		if (width + ww > maxW && lines[lines.length - 1].length) {
			lines.push([]);
			width = 0;
		}
		lines[lines.length - 1].push(...word);
		width += ww;
	}
	return lines;
}

function headline(input: CardInput, x: number, y: number, size: number, maxW: number) {
	let lines = wrapInked(input.headline, input, size, maxW);
	while (lines.length > 3 && size > 30) lines = wrapInked(input.headline, input, (size -= 4), maxW);
	const lh = size * 1.05;
	return {
		height: lines.length * lh,
		svg: lines
			.map(
				(line, i) =>
					`<text x="${x}" y="${y + size + i * lh}" font-size="${size}" font-weight="800" letter-spacing="${-size * 0.03}" fill="${C.ink}">` +
					line.map((w) => `<tspan${w.ink ? ` fill="${C[w.ink]}"` : ''}>${esc(w.text)}</tspan>`).join('') +
					`</text>`
			)
			.join('')
	};
}

/** Contour mark + one-line Unbounded wordmark. */
function logo(x: number, y: number, size: number) {
	const sc = size / 40;
	return (
		`<g transform="translate(${x} ${y}) scale(${sc})">` +
		`<g fill="none" stroke="${C.a}" stroke-width="2.6">` +
		`<path d="M20 4.5c8.5 0 15 6 15 14.3S28.6 35 19.5 35 5 28.3 5 20 11.5 4.5 20 4.5z"/>` +
		`<path d="M19.6 10c5.4 0 9.6 4 9.6 9.2s-4 10-9.8 10-9.6-4.3-9.6-9.4S14.2 10 19.6 10z"/>` +
		`<path d="M19.4 15.3c2.5 0 4.4 1.8 4.4 4.1s-1.9 4.5-4.5 4.5-4.4-1.9-4.4-4.2 2-4.4 4.5-4.4z"/></g>` +
		`<path fill="${C.b}" stroke="${C.paper}" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke" d="M23 18.5l5.5-2.8 4.7 2.4 1.5 5.2-2.6 4.6-5.4 1.4-4.6-2.8-.7-4.6z"/></g>` +
		`<text x="${x + size + 12}" y="${y + size * 0.68}" font-family="${BRAND_FONT}" font-size="${size * 0.5}" font-weight="700" letter-spacing="${-size * 0.01}" fill="${C.ink}">compare cities</text>`
	);
}

function legend(input: CardInput, x: number, y: number, size: number) {
	const dot = (cx: number, color: string) => `<circle cx="${cx}" cy="${y - size * 0.33}" r="${size * 0.38}" fill="${color}"/>`;
	const aW = advance(input.a.name, size, 600) + size * 2.2;
	return (
		dot(x + size * 0.4, C.a) +
		`<text x="${x + size * 1.1}" y="${y}" font-size="${size}" font-weight="500" fill="${C.ink}">${esc(input.a.name)}</text>` +
		dot(x + aW + size * 0.4, C.b) +
		`<text x="${x + aW + size * 1.1}" y="${y}" font-size="${size}" font-weight="500" fill="${C.ink}">${esc(input.b.name)}</text>`
	);
}

function stat(s: CardStat, x: number, y: number, size: number) {
	return (
		`<text x="${x}" y="${y}" font-size="${size * 0.62}" font-weight="500" fill="${C.muted}">${esc(s.label)}</text>` +
		`<circle cx="${x + size * 0.3}" cy="${y + size * 0.95}" r="${size * 0.26}" fill="${C.a}"/>` +
		`<text x="${x + size * 0.75}" y="${y + size * 1.25}" font-size="${size}" font-weight="800" fill="${C.ink}">${esc(s.a)}</text>` +
		`<circle cx="${x + size * 0.3}" cy="${y + size * 2.25}" r="${size * 0.26}" fill="${C.b}"/>` +
		`<text x="${x + size * 0.75}" y="${y + size * 2.55}" font-size="${size}" font-weight="800" fill="${C.ink}">${esc(s.b)}</text>`
	);
}

// ---- Layouts ------------------------------------------------------------------------

export function buildCardSvg(input: CardInput, format: CardFormat, fontCss = ''): string {
	const [W, H] = CARD_SIZE[format];
	let body = '';
	if (format === 'landscape') {
		body += `<rect x="36" y="36" width="560" height="558" rx="28" fill="${C.card}"/>`;
		body += shapes(input, 56, 96, 520, 478);
		body += legend(input, 64, 80, 22);
		body += logo(640, 48, 44);
		const h = headline(input, 640, 120, 54, 520);
		body += h.svg;
		const top = Math.max(120 + h.height + 36, 330);
		input.stats.slice(0, 3).forEach((s, i) => (body += stat(s, 640 + i * 178, top, 30)));
		body += `<text x="640" y="590" font-size="22" font-weight="500" fill="${C.muted}">${esc(input.site)}</text>`;
	} else {
		body += logo(64, 60, 56);
		const h = headline(input, 64, 150, 74, 952);
		body += h.svg;
		const cardY = 150 + h.height + 40;
		const cardH = 1110 - cardY;
		body += `<rect x="48" y="${cardY}" width="984" height="${cardH}" rx="36" fill="${C.card}"/>`;
		body += legend(input, 80, cardY + 54, 30);
		body += shapes(input, 72, cardY + 80, 936, cardH - 100);
		input.stats.slice(0, 3).forEach((s, i) => (body += stat(s, 64 + i * 330, 1160, 40)));
		body += `<text x="64" y="1310" font-size="30" font-weight="500" fill="${C.muted}">${esc(input.site)}</text>`;
	}
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}, sans-serif">` +
		(fontCss ? `<style>${fontCss}</style>` : '') +
		`<rect width="${W}" height="${H}" fill="${C.paper}"/>` +
		body +
		`</svg>`
	);
}

/** The card content for a pair of cities, shared by the page and the OG endpoint. */
export function cardInput(
	a: CardCity & { areaKm2: number; population?: number },
	b: CardCity & { areaKm2: number; population?: number },
	site: string
): CardInput {
	const fmt = (n: number, max = 0) => new Intl.NumberFormat('en', { maximumFractionDigits: max }).format(n);
	const compact = (n: number) => (n >= 1e6 ? `${fmt(n / 1e6, 1)}M` : n >= 1e4 ? `${fmt(n / 1e3)}k` : fmt(n));
	const big = a.areaKm2 >= b.areaKm2 ? 'a' : 'b';
	const small = big === 'a' ? 'b' : 'a';
	const ratio = Math.max(a.areaKm2, b.areaKm2) / Math.min(a.areaKm2, b.areaKm2);
	const name = (k: 'a' | 'b') => `{${k}}`;
	const headlineParts: CardInput['headline'] =
		ratio < 1.15
			? [{ text: name('a'), ink: 'a' }, { text: ' and ' }, { text: name('b'), ink: 'b' }, { text: ' are about the same size.' }]
			: ratio < 1.95
				? [{ text: name(big), ink: big }, { text: ` is ${fmt((ratio - 1) * 100)}% bigger than ` }, { text: name(small), ink: small }, { text: '.' }]
				: [{ text: name(big), ink: big }, { text: ` is ${fmt(ratio, ratio < 10 ? 1 : 0)}× the size of ` }, { text: name(small), ink: small }, { text: '.' }];
	const stats: CardStat[] = [{ label: 'Area', a: `${fmt(a.areaKm2)} km²`, b: `${fmt(b.areaKm2)} km²` }];
	if (a.population && b.population) {
		stats.push({ label: 'People', a: compact(a.population), b: compact(b.population) });
		stats.push({
			label: 'Per km²',
			a: fmt(a.population / a.areaKm2),
			b: fmt(b.population / b.areaKm2)
		});
	}
	return { a, b, headline: headlineParts, stats, site };
}

/** Plain-text version of the headline, for link previews and share text. */
export const headlineText = (input: CardInput) =>
	input.headline.map((p) => p.text.replace('{a}', input.a.name).replace('{b}', input.b.name)).join('');

/** The link-preview image for the bare site (no cities chosen yet). */
export function buildBrandSvg(site: string): string {
	const [W, H] = CARD_SIZE.landscape;
	// Big contour mark on the right, bleeding off the edge like a map detail.
	const mark =
		`<g transform="translate(700 70) scale(13)">` +
		`<g fill="none" stroke="${C.a}" stroke-width="1.6">` +
		`<path d="M20 4.5c8.5 0 15 6 15 14.3S28.6 35 19.5 35 5 28.3 5 20 11.5 4.5 20 4.5z"/>` +
		`<path d="M19.6 10c5.4 0 9.6 4 9.6 9.2s-4 10-9.8 10-9.6-4.3-9.6-9.4S14.2 10 19.6 10z"/>` +
		`<path d="M19.4 15.3c2.5 0 4.4 1.8 4.4 4.1s-1.9 4.5-4.5 4.5-4.4-1.9-4.4-4.2 2-4.4 4.5-4.4z"/></g>` +
		`<path fill="${C.b}" stroke="${C.paper}" stroke-width="1.4" stroke-linejoin="round" paint-order="stroke" d="M23 18.5l5.5-2.8 4.7 2.4 1.5 5.2-2.6 4.6-5.4 1.4-4.6-2.8-.7-4.6z"/></g>`;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}, sans-serif">` +
		`<rect width="${W}" height="${H}" fill="${C.paper}"/>` +
		mark +
		`<text x="72" y="250" font-family="${BRAND_FONT}" font-size="76" font-weight="700" letter-spacing="-2" fill="${C.ink}">compare</text>` +
		`<text x="72" y="340" font-family="${BRAND_FONT}" font-size="76" font-weight="700" letter-spacing="-2" fill="${C.ink}">cities</text>` +
		`<text x="72" y="420" font-size="36" font-weight="500" fill="${C.muted}">Every city at its true size and shape.</text>` +
		`<text x="72" y="470" font-size="30" font-weight="500" fill="${C.muted}">Drop any city on top of another and compare.</text>` +
		`<text x="72" y="568" font-size="24" font-weight="500" fill="${C.muted}">${esc(site)}</text>` +
		`</svg>`
	);
}
