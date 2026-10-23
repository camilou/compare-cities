// Generates the cartographic background textures in static/carto/.
// Each SVG is a single-colour mask (black on transparent) so CSS can tint it per theme.
//   contours.svg  topographic contour lines + graticule
//   marks.svg     dashed routes, a border, town dots and survey crosses
// Re-run with `node scripts/make-carto-bg.mjs` (deterministic: seeded RNG).
import { mkdirSync, writeFileSync } from 'node:fs';
import { contours } from 'd3-contour';

const W = 1600;
const H = 1000;
const OUT = new URL('../static/carto/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// Small seeded RNG so the texture never changes between builds.
let seed = 20261022;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// Periodic value noise: the lattice wraps, so the texture tiles without seams.
// The tile is 8 × 5 lattice cells at the base octave (matching 1600 × 1000).
const PX = 8;
const PY = 5;
const lattice = Array.from({ length: 64 * 64 }, rand);
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y, px, py, salt) {
	const at = (i, j) => lattice[(((j % py) + py) % py) * 64 + ((((i % px) + px) % px) + salt) % 64];
	const xi = Math.floor(x), yi = Math.floor(y);
	const tx = smooth(x - xi), ty = smooth(y - yi);
	const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
	return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
// u, v in [0, 1) across the tile.
const fbm = (u, v) =>
	noise(u * PX, v * PY, PX, PY, 0) * 0.6 +
	noise(u * PX * 2, v * PY * 2, PX * 2, PY * 2, 17) * 0.28 +
	noise(u * PX * 4, v * PY * 4, PX * 4, PY * 4, 31) * 0.12;

const f = (n) => Math.round(n * 10) / 10;

// ---- contours.svg -------------------------------------------------------------
const CELL = 8;
const gw = W / CELL + 1;
const gh = H / CELL + 1;
const values = new Float64Array(gw * gh);
// Sample one extra row/column (i = W / CELL) that equals the first, so edges match.
for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) values[j * gw + i] = fbm((i * CELL) / W, (j * CELL) / H);

const levels = Array.from({ length: 16 }, (_, k) => 0.2 + k * 0.04);
const rings = contours().size([gw, gh]).thresholds(levels)(values);

let contourPaths = '';
rings.forEach((r, idx) => {
	const d = r.coordinates
		.flat()
		.map((ring) => "M" + ring.map(([x, y]) => `${Math.round(x * CELL)},${Math.round(y * CELL)}`).join('L') + 'Z')
		.join('');
	// Every fourth contour is an "index contour": drawn thicker, like on survey maps.
	const index = idx % 4 === 0;
	contourPaths += `<path d="${d}" stroke-width="${index ? 1.4 : 0.8}" ${index ? '' : 'opacity=".7"'}/>`;
});

let graticule = '';
for (let x = 100; x < W; x += 200) graticule += `M${x},0V${H}`;
for (let y = 100; y < H; y += 200) graticule += `M0,${y}H${W}`;

writeFileSync(
	new URL('contours.svg', OUT),
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
		`<g fill="none" stroke="#000" stroke-linejoin="round">${contourPaths}</g>` +
		`<path d="${graticule}" fill="none" stroke="#000" stroke-width=".8" stroke-dasharray="2 6" opacity=".8"/>` +
		`</svg>`
);

// ---- marks.svg ----------------------------------------------------------------
// Wandering polylines for routes and a border, smoothed with quadratic curves.
function wander(x, y, angle, steps, stepLen, turn) {
	const pts = [[x, y]];
	for (let i = 0; i < steps; i++) {
		angle += (rand() - 0.5) * turn;
		x += Math.cos(angle) * stepLen;
		y += Math.sin(angle) * stepLen;
		pts.push([x, y]);
	}
	let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const mx = (pts[i][0] + pts[i + 1][0]) / 2;
		const my = (pts[i][1] + pts[i + 1][1]) / 2;
		d += `Q${f(pts[i][0])},${f(pts[i][1])} ${f(mx)},${f(my)}`;
	}
	return d;
}

const routes = [
	wander(-20, 180, 0.15, 30, 60, 0.7),
	wander(300, -20, 1.35, 22, 55, 0.8),
	wander(1620, 420, Math.PI + 0.1, 32, 55, 0.6),
	wander(900, 1020, -1.5, 20, 55, 0.9)
];
const border = wander(1100, -20, 1.9, 40, 32, 1.3);

let dots = '';
for (let i = 0; i < 70; i++) {
	const x = f(rand() * W);
	const y = f(rand() * H);
	const kind = rand();
	if (kind < 0.12) {
		// "city": filled dot with a ring
		dots += `<circle cx="${x}" cy="${y}" r="3.2"/><circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#000" stroke-width="1.2"/>`;
	} else if (kind < 0.22) {
		// survey cross
		dots += `<path d="M${x - 5},${y}h10M${x},${y - 5}v10" stroke="#000" stroke-width="1.2"/>`;
	} else {
		dots += `<circle cx="${x}" cy="${y}" r="${kind < 0.6 ? 1.6 : 2.4}"/>`;
	}
}

// Draw everything once, then reuse it shifted by one tile in each direction so
// lines leaving one edge re-enter on the opposite one.
const marks =
	`<g fill="none" stroke="#000" stroke-linecap="round">` +
	routes.map((d) => `<path d="${d}" stroke-width="1.6" stroke-dasharray="10 7"/>`).join('') +
	`<path d="${border}" stroke-width="1.4" stroke-dasharray="14 5 2 5"/>` +
	`</g><g fill="#000">${dots}</g>`;
let copies = '';
for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) if (dx || dy) copies += `<use href="#m" x="${dx}" y="${dy}"/>`;
writeFileSync(
	new URL('marks.svg', OUT),
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
		`<g id="m">${marks}</g>${copies}</svg>`
);

console.log('Wrote static/carto/contours.svg and static/carto/marks.svg');
