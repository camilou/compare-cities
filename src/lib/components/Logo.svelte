<script lang="ts">
	let { size = 36 }: { size?: number } = $props();
</script>

<!-- Contour rings (city A) with a second city dropped on top (city B). -->
<svg class="mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
	<g class="rings">
		<path d="M20 4.5c8.5 0 15 6 15 14.3S28.6 35 19.5 35 5 28.3 5 20 11.5 4.5 20 4.5z" />
		<path d="M19.6 10c5.4 0 9.6 4 9.6 9.2s-4 10-9.8 10-9.6-4.3-9.6-9.4S14.2 10 19.6 10z" />
		<path d="M19.4 15.3c2.5 0 4.4 1.8 4.4 4.1s-1.9 4.5-4.5 4.5-4.4-1.9-4.4-4.2 2-4.4 4.5-4.4z" />
	</g>
	<path class="city" d="M23 18.5l5.5-2.8 4.7 2.4 1.5 5.2-2.6 4.6-5.4 1.4-4.6-2.8-.7-4.6z" />
</svg>

<style>
	.mark {
		flex: none;
		overflow: visible;
	}
	.rings {
		fill: none;
		stroke: var(--color-a);
		stroke-width: 2.4;
	}
	/* The second city gets a paper-coloured ring where it crosses the contours. */
	.city {
		fill: var(--color-b);
		stroke: var(--color-paper);
		stroke-width: 2.5;
		stroke-linejoin: round;
		paint-order: stroke;
	}
</style>
