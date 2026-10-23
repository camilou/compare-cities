<!--
	Tactile map button: a raised face on a darker base that lifts on hover and
	presses in on click. Hovering drops a map pin and a town marker beside it, and
	faint contour lines drift across the face.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Common = {
		variant?: 'tangerine' | 'violet' | 'paper';
		size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
		icon?: Snippet;
		children?: Snippet;
		class?: string;
	};
	type Props = Common & ((HTMLButtonAttributes & { href?: undefined }) | (HTMLAnchorAttributes & { href: string }));

	let { variant = 'paper', size = 'md', icon, children, class: cls = '', ...rest }: Props = $props();
</script>

<svelte:element
	this={rest.href ? 'a' : 'button'}
	class="btn {cls}"
	data-variant={variant}
	data-size={size}
	{...rest}
>
	<svg class="pop pin" viewBox="0 0 16 22" aria-hidden="true">
		<path d="M8 21C6 17.5 1 13.4 1 8a7 7 0 0 1 14 0c0 5.4-5 9.5-7 13z" />
		<circle cx="8" cy="8" r="2.6" />
	</svg>
	<svg class="pop town" viewBox="0 0 16 16" aria-hidden="true">
		<circle cx="8" cy="8" r="6.2" class="ring" />
		<circle cx="8" cy="8" r="2.8" />
	</svg>
	<span class="face">
		<span class="shine" aria-hidden="true"></span>
		{#if icon}<span class="icon">{@render icon()}</span>{/if}
		{#if children}<span class="label">{@render children()}</span>{/if}
	</span>
</svelte:element>

<style>
	.btn {
		/* palette per variant: face, base (the darker "side"), text, pop colours */
		--face: var(--color-card);
		--base: #d9cfa8;
		--text: var(--color-ink);
		--pin: var(--color-b);
		--town: var(--color-a);
		--depth: 5px;
		--radius: 1rem;
		--contours: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 84 56' fill='none' stroke='%23000' stroke-opacity='.07' stroke-width='1.2'%3E%3Cpath d='M22 4c11 0 19 7 19 17s-8 19-20 19S2 32 2 22 10 4 22 4z'/%3E%3Cpath d='M21 11c6 0 11 4 11 10s-5 12-11 12-11-5-11-11 5-11 11-11z'/%3E%3Cpath d='M21 18c2 0 4 2 4 4s-2 4-4 4-4-2-4-4 2-4 4-4z'/%3E%3Cpath d='M64 30c9 0 16 6 16 13s-6 12-15 12-17-4-17-12 7-13 16-13z'/%3E%3Cpath d='M64 37c4 0 8 3 8 6s-3 6-7 6-9-2-9-6 4-6 8-6z'/%3E%3Cpath d='M46 2c4 6 13 6 18 3s14-3 20 1M0 50c8-4 14 2 22-1s10-6 18-2'/%3E%3C/svg%3E");

		position: relative;
		display: inline-flex;
		flex: none;
		padding: 0 0 var(--depth);
		border: 0;
		border-radius: var(--radius);
		background: var(--base);
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
	}
	.btn[data-variant='tangerine'] {
		--face: #ff9a4d;
		--base: #c24e05;
		--text: #2a1606;
		--pin: var(--color-a);
		--town: #fff3c4;
	}
	.btn[data-variant='violet'] {
		--face: #8a66ff;
		--base: #4b25c4;
		--text: #ffffff;
		--pin: var(--color-b);
		--town: #ffd9bf;
	}
	:global([data-theme='dark']) .btn {
		--contours: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 84 56' fill='none' stroke='%23fff' stroke-opacity='.08' stroke-width='1.2'%3E%3Cpath d='M22 4c11 0 19 7 19 17s-8 19-20 19S2 32 2 22 10 4 22 4z'/%3E%3Cpath d='M21 11c6 0 11 4 11 10s-5 12-11 12-11-5-11-11 5-11 11-11z'/%3E%3Cpath d='M21 18c2 0 4 2 4 4s-2 4-4 4-4-2-4-4 2-4 4-4z'/%3E%3Cpath d='M64 30c9 0 16 6 16 13s-6 12-15 12-17-4-17-12 7-13 16-13z'/%3E%3Cpath d='M64 37c4 0 8 3 8 6s-3 6-7 6-9-2-9-6 4-6 8-6z'/%3E%3Cpath d='M46 2c4 6 13 6 18 3s14-3 20 1M0 50c8-4 14 2 22-1s10-6 18-2'/%3E%3C/svg%3E");
	}
	:global([data-theme='dark']) .btn[data-variant='paper'] {
		--base: #120e22;
	}
	:global([data-theme='dark']) .btn[data-variant='tangerine'] {
		--face: #f2782c;
		--base: #8f3a05;
		--text: #1d1206;
	}
	:global([data-theme='dark']) .btn[data-variant='violet'] {
		--face: #7b56f7;
		--base: #33188f;
	}

	.face {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2.75rem;
		padding: 0.6rem 1.15rem;
		border: 2px solid var(--base);
		border-radius: var(--radius);
		background-color: var(--face);
		/* faint topographic contours, like the map texture behind the page */
		background-image: var(--contours);
		background-size: 84px 56px;
		background-position: 0 0;
		font-weight: 750;
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;
		transition:
			transform 0.15s cubic-bezier(0.3, 0.7, 0.4, 1),
			background-position 3s ease-out;
	}
	.shine {
		position: absolute;
		top: 0.3rem;
		left: 0.65rem;
		width: 1.4rem;
		height: 0.32rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.6);
		pointer-events: none;
	}
	:global([data-theme='dark']) .btn[data-variant='paper'] .shine {
		background: rgb(255 255 255 / 0.12);
	}
	.icon {
		display: inline-grid;
		place-items: center;
	}
	.icon :global(svg) {
		width: 1.2rem;
		height: 1.2rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* Pop-outs: a pin drops in top-right, a town marker bottom-left. */
	.pop {
		position: absolute;
		z-index: 2;
		pointer-events: none;
		transform: scale(0);
		transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.pin {
		top: -0.7rem;
		right: -0.45rem;
		width: 0.85rem;
		height: 1.15rem;
		transform-origin: 50% 100%;
		fill: var(--pin);
		stroke: var(--color-card);
		stroke-width: 1.5;
	}
	.pin circle {
		fill: var(--color-card);
		stroke: none;
	}
	.town {
		bottom: -0.35rem;
		left: -0.45rem;
		width: 0.85rem;
		height: 0.85rem;
		fill: var(--town);
		transition-delay: 0.06s;
	}
	.town .ring {
		fill: none;
		stroke: var(--town);
		stroke-width: 1.6;
	}

	/* Interaction */
	.btn:hover .face {
		transform: translateY(-2px);
		background-position: 42px 18px; /* the terrain drifts under you */
	}
	.btn:hover .pin {
		transform: scale(1) rotate(12deg);
	}
	.btn:hover .town {
		transform: scale(1);
	}
	.btn:active .face {
		transform: translateY(var(--depth));
		transition-duration: 0.06s;
	}
	.btn:focus-visible {
		outline: 3px solid var(--color-sun);
		outline-offset: 3px;
	}
	.btn:disabled,
	.btn[aria-disabled='true'] {
		cursor: default;
		opacity: 0.45;
	}
	.btn:disabled .face {
		transform: none;
	}
	.btn:disabled .pop {
		display: none;
	}

	/* Sizes */
	.btn[data-size='sm'] {
		--depth: 4px;
		--radius: 0.85rem;
	}
	.btn[data-size='sm'] .face {
		min-height: 2.2rem;
		padding: 0.4rem 0.85rem;
		font-size: 0.875rem;
	}
	.btn[data-size='lg'] {
		--depth: 6px;
		--radius: 1.15rem;
	}
	.btn[data-size='lg'] .face {
		min-height: 3.25rem;
		padding: 0.8rem 1.5rem;
		font-size: 1.05rem;
	}
	.btn[data-size='icon'] .face,
	.btn[data-size='icon-sm'] .face {
		padding: 0;
		width: 2.75rem;
		min-height: 2.75rem;
	}
	.btn[data-size='icon-sm'] {
		--depth: 4px;
		--radius: 0.8rem;
	}
	.btn[data-size='icon-sm'] .face {
		width: 2.3rem;
		min-height: 2.3rem;
	}
	.btn[data-size^='icon'] .shine {
		top: 0.22rem;
		left: 0.35rem;
		width: 0.7rem;
		height: 0.26rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.pop {
			display: none;
		}
		.face {
			transition: none;
			background-position: 0 0 !important;
		}
	}
</style>
