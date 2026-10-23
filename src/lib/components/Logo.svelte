<script lang="ts">
	let { size = 36 }: { size?: number } = $props();
</script>

<!-- Two city outlines printed in two inks; where they overlap the inks mix. -->
<svg class="mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
	<path
		class="a"
		d="M5 11.5 13 5l7.5 3.2L27 6l4.5 6.5-1.8 7.6 2.6 6.4L25 34l-7.8-2.6L9 33.5 4.5 26l2.4-6.3z"
	/>
	<path
		class="b"
		d="M15.5 16.2 22 12.5l5.4 2.6 6.3-.9 2.8 6.1-2.4 5.3 1.4 6-6.3 3.7-5.4-2.4-6.2 1.6-3-6.3 2.1-5.2z"
	/>
</svg>

<style>
	.mark {
		flex: none;
		overflow: visible;
	}
	.a {
		fill: var(--color-a);
	}
	.b {
		fill: var(--color-b);
		mix-blend-mode: multiply;
		opacity: 0.92;
	}
	:global([data-theme='dark']) .b {
		mix-blend-mode: screen;
		opacity: 0.85;
	}
</style>
