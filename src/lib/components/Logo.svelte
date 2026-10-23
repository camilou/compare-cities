<script lang="ts" module>
	export const LOGO_VARIANTS = [
		{ id: 'overlap', name: 'Overlap', note: 'Two city outlines printed on top of each other. The current one.' },
		{ id: 'pins', name: 'Two pins', note: 'Two map pins leaning on each other. Instantly "maps", a bit expected.' },
		{ id: 'cc', name: 'cc monogram', note: 'Two Cs (compare, cities) interlocking like overlapping boundaries.' },
		{ id: 'scale', name: 'Scale bar', note: 'A cartographer’s scale bar under two sizes. Says "true size" literally.' },
		{ id: 'blocks', name: 'City blocks', note: 'Two street grids rotated against each other: two cities, one map.' },
		{ id: 'contour', name: 'Contour', note: 'Topographic contour rings with a second city dropped on top.' }
	] as const;
	export type LogoVariant = (typeof LOGO_VARIANTS)[number]['id'];
</script>

<script lang="ts">
	let { size = 36, variant = 'overlap' }: { size?: number; variant?: LogoVariant } = $props();
</script>

<svg class="mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
	{#if variant === 'overlap'}
		<path class="a" d="M5 11.5 13 5l7.5 3.2L27 6l4.5 6.5-1.8 7.6 2.6 6.4L25 34l-7.8-2.6L9 33.5 4.5 26l2.4-6.3z" />
		<path class="b" d="M15.5 16.2 22 12.5l5.4 2.6 6.3-.9 2.8 6.1-2.4 5.3 1.4 6-6.3 3.7-5.4-2.4-6.2 1.6-3-6.3 2.1-5.2z" />
	{:else if variant === 'pins'}
		<path class="a" fill-rule="evenodd" d="M15 37C12 32 4 25 4 16a11 11 0 0 1 22 0c0 9-8 16-11 21zm0-17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
		<path class="b" fill-rule="evenodd" d="M26 38c-2.4-4-9-9.6-9-17a9 9 0 0 1 18 0c0 7.4-6.6 13-9 17zm0-14a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z" />
	{:else if variant === 'cc'}
		<path class="a-stroke" d="M21.5 12.5A10 10 0 1 0 21.5 27.5" />
		<path class="b-stroke" d="M33.5 12.5A10 10 0 1 0 33.5 27.5" />
	{:else if variant === 'scale'}
		<rect class="a" x="4" y="5" width="20" height="20" rx="5" />
		<rect class="b" x="21" y="12" width="13" height="13" rx="3.5" />
		<g class="bar">
			<rect x="4" y="30" width="32" height="5" rx="1" />
			<rect class="fill-a" x="4" y="30" width="8" height="5" />
			<rect class="fill-b" x="20" y="30" width="8" height="5" />
		</g>
	{:else if variant === 'blocks'}
		<g>
			<rect class="a" x="4" y="4" width="22" height="22" rx="4" />
			<path class="street" d="M11.5 4v22M18.5 4v22M4 11.5h22M4 18.5h22" />
		</g>
		<g transform="rotate(-18 25 25)">
			<rect class="b" x="15" y="15" width="21" height="21" rx="4" />
			<path class="street" d="M22 15v21M29 15v21M15 22h21M15 29h21" />
		</g>
	{:else if variant === 'contour'}
		<g class="a-stroke thin">
			<path d="M20 4.5c8.5 0 15 6 15 14.3S28.6 35 19.5 35 5 28.3 5 20 11.5 4.5 20 4.5z" />
			<path d="M19.6 10c5.4 0 9.6 4 9.6 9.2s-4 10-9.8 10-9.6-4.3-9.6-9.4S14.2 10 19.6 10z" />
			<path d="M19.4 15.3c2.5 0 4.4 1.8 4.4 4.1s-1.9 4.5-4.5 4.5-4.4-1.9-4.4-4.2 2-4.4 4.5-4.4z" />
		</g>
		<!-- The second city sits on the map with a paper-coloured ring, not a muddy blend. -->
		<path class="b solid" d="M23 18.5l5.5-2.8 4.7 2.4 1.5 5.2-2.6 4.6-5.4 1.4-4.6-2.8-.7-4.6z" />
	{/if}
</svg>

<style>
	.mark {
		flex: none;
		overflow: visible;
	}
	.a,
	.fill-a {
		fill: var(--color-a);
	}
	.b,
	.fill-b {
		fill: var(--color-b);
	}
	.b {
		mix-blend-mode: multiply;
		opacity: 0.92;
	}
	.a-stroke,
	.b-stroke {
		fill: none;
		stroke-width: 6;
		stroke-linecap: round;
	}
	.a-stroke {
		stroke: var(--color-a);
	}
	.b-stroke {
		stroke: var(--color-b);
		mix-blend-mode: multiply;
	}
	.thin {
		stroke-width: 2.4;
	}
	.b.solid {
		mix-blend-mode: normal;
		opacity: 1;
		stroke: var(--color-paper);
		stroke-width: 2.5;
		stroke-linejoin: round;
		paint-order: stroke;
	}
	:global([data-theme='dark']) .b.solid {
		mix-blend-mode: normal;
		opacity: 1;
	}
	.bar rect:first-child {
		fill: var(--color-card);
		stroke: var(--color-ink);
		stroke-width: 1.4;
	}
	.street {
		stroke: var(--color-card);
		stroke-width: 1.3;
		opacity: 0.75;
	}
	:global([data-theme='dark']) .b,
	:global([data-theme='dark']) .b-stroke {
		mix-blend-mode: screen;
		opacity: 0.88;
	}
</style>
