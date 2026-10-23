<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Map as MLMap, GeoJSONSource, Marker, LngLatBoundsLike } from 'maplibre-gl';
	import type { Feature, FeatureCollection } from 'geojson';
	import { transplant, bbox, type LngLat } from '$lib/geo';
	import { theme, inks } from '$lib/theme.svelte';
	import Btn from './Btn.svelte';
	import type { Area } from '$lib/types';

	interface Shape {
		key: string;
		name: string;
		shape: Area;
		center: LngLat;
		areaKm2: number;
	}

	let { home, guest, topInset = 0 }: { home?: Shape; guest?: Shape; topInset?: number } = $props();

	const STYLES = {
		light: 'https://tiles.openfreemap.org/styles/positron',
		dark: 'https://tiles.openfreemap.org/styles/fiord'
	};
	let styleReady = $state(0); // bumps every time a (new) basemap style finishes loading
	const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

	let container: HTMLDivElement;
	let map = $state<MLMap>();
	let handle: Marker | undefined;
	let anchor = $state<LngLat>([0, 0]);
	// Pointer events can fire several times per frame; move the overlay at most once per frame.
	let queued: LngLat | undefined;
	function moveTo(p: LngLat) {
		if (!queued) requestAnimationFrame(() => {
			if (queued) anchor = queued;
			queued = undefined;
		});
		queued = p;
	}
	let rotation = $state(0);
	let moved = $derived(rotation !== 0 || (home && (anchor[0] !== home.center[0] || anchor[1] !== home.center[1])));

	const placed = $derived(home && guest ? transplant(guest.shape, guest.center, anchor, rotation) : undefined);

	const feature = (g?: Area): Feature | FeatureCollection => (g ? { type: 'Feature', properties: {}, geometry: g } : EMPTY);

	onMount(() => {
		let disposed = false;
		Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')]).then(([ml, worker]) => {
			if (disposed) return;
			ml.setWorkerUrl(worker.default);
			const m = new ml.Map({
				container,
				style: STYLES[theme.current],
				center: [-74.08, 4.65],
				zoom: 9,
				attributionControl: { compact: true },
				dragRotate: false,
				pitchWithRotate: false,
				cooperativeGestures: false
			});
			m.touchZoomRotate.disableRotation();
			m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');

			const el = document.createElement('button');
			el.className = 'guest-handle';
			el.setAttribute('aria-label', 'Drag to move the overlay');
			const marker = new ml.Marker({ element: el, draggable: true }).setLngLat(anchor).addTo(m);
			handle = marker;
			marker.on('drag', () => {
				const p = marker.getLngLat();
				moveTo([p.lng, p.lat]);
			});

			m.on('style.load', () => {
				addOverlay(m);
				styleReady++;
			});
			enableShapeDrag(m);
			map = m;
		});
		return () => {
			disposed = true;
			map?.remove();
		};
	});

	function addOverlay(m: MLMap) {
		const ink = inks();
		const glow = theme.current === 'dark' ? 0.22 : 0.13;
		m.addSource('home', { type: 'geojson', data: EMPTY });
		m.addSource('guest', { type: 'geojson', data: EMPTY });
		m.addLayer({ id: 'home-fill', type: 'fill', source: 'home', paint: { 'fill-color': ink.a, 'fill-opacity': glow } });
		m.addLayer({
			id: 'home-line',
			type: 'line',
			source: 'home',
			paint: { 'line-color': ink.a, 'line-width': 2.5 },
			layout: { 'line-join': 'round' }
		});
		m.addLayer({ id: 'guest-fill', type: 'fill', source: 'guest', paint: { 'fill-color': ink.b, 'fill-opacity': 0.4 } });
		m.addLayer({
			id: 'guest-line',
			type: 'line',
			source: 'guest',
			paint: { 'line-color': ink.b, 'line-width': 2.5 },
			layout: { 'line-join': 'round' }
		});
	}

	// Swap the basemap when the theme changes; the overlay is re-added on style.load.
	let shownTheme = theme.current;
	$effect(() => {
		const t = theme.current;
		if (!map || t === shownTheme) return;
		shownTheme = t;
		map.setStyle(STYLES[t], { diff: false });
	});

	/** Grab the second city's shape itself with a mouse and slide it around. */
	function enableShapeDrag(m: MLMap) {
		let grab: { dx: number; dy: number } | undefined;
		m.on('mouseenter', 'guest-fill', () => (m.getCanvas().style.cursor = 'grab'));
		m.on('mouseleave', 'guest-fill', () => (m.getCanvas().style.cursor = ''));
		m.on('mousedown', 'guest-fill', (e) => {
			e.preventDefault();
			grab = { dx: anchor[0] - e.lngLat.lng, dy: anchor[1] - e.lngLat.lat };
			m.getCanvas().style.cursor = 'grabbing';
		});
		m.on('mousemove', (e) => {
			if (grab) moveTo([e.lngLat.lng + grab.dx, e.lngLat.lat + grab.dy]);
		});
		m.on('mouseup', () => {
			grab = undefined;
			m.getCanvas().style.cursor = '';
		});
	}

	// New pair of cities: put the guest on the home city's centre and frame both.
	let lastKey = '';
	$effect(() => {
		if (!map || !styleReady || !home || !guest) return;
		const key = `${home.key}|${guest.key}`;
		if (key === lastKey) return;
		lastKey = key;
		untrack(() => {
			anchor = home.center;
			rotation = 0;
			fit();
		});
	});

	$effect(() => {
		if (!map || !styleReady) return;
		(map.getSource('home') as GeoJSONSource).setData(feature(home?.shape));
		(map.getSource('guest') as GeoJSONSource).setData(feature(placed));
		handle?.setLngLat(anchor);
		handle?.getElement().classList.toggle('hidden', !placed);
	});

	function fit() {
		if (!map || !home) return;
		const shapes = [home.shape, placed].filter(Boolean) as Area[];
		const narrow = container.clientWidth < 640;
		map.fitBounds(bbox(...shapes) as LngLatBoundsLike, {
			padding: narrow
				? { top: topInset + 24, bottom: 80, left: 24, right: 24 }
				: { top: topInset + 40, bottom: 90, left: 80, right: 80 },
			duration: 900,
			maxZoom: 14
		});
	}

	function reset() {
		if (!home) return;
		anchor = home.center;
		rotation = 0;
		fit();
	}

	const rotate = (by: number) => (rotation = (((rotation + by) % 360) + 360) % 360);
</script>

<div class="frame">
	<div class="map" bind:this={container}></div>

	{#if home && guest}
		<div class="tools" role="toolbar" aria-label="Overlay controls">
			<Btn size="icon-sm" onclick={() => rotate(-15)} aria-label="Rotate overlay left">
				{#snippet icon()}<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></svg>{/snippet}
			</Btn>
			<span class="deg tnum" aria-live="polite">{rotation}°</span>
			<Btn size="icon-sm" onclick={() => rotate(15)} aria-label="Rotate overlay right">
				{#snippet icon()}<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v4h-4" /></svg>{/snippet}
			</Btn>
			<Btn size="icon-sm" variant="violet" onclick={reset} disabled={!moved} aria-label="Put the overlay back on the centre">
				{#snippet icon()}<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>{/snippet}
			</Btn>
		</div>
	{/if}

	{#if !map || !home}
		<div class="loading" aria-hidden="true"></div>
	{/if}
</div>

<style>
	.frame {
		position: relative;
		height: min(76svh, 860px);
		min-height: 440px;
		overflow: hidden;
		background: var(--color-card);
		isolation: isolate;
		border-block: 1px solid var(--color-line);
	}
	.map {
		position: absolute;
		inset: 0;
	}
	.tools {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.deg {
		min-width: 2.8rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.6rem;
		background: var(--color-glass);
		backdrop-filter: blur(8px);
		text-align: center;
		font-size: 0.85rem;
		font-weight: 650;
	}
	.loading {
		position: absolute;
		inset: 0;
		background: linear-gradient(100deg, var(--color-card) 30%, var(--color-paper) 50%, var(--color-card) 70%) 0 0 / 300% 100%;
		animation: shimmer 1.4s linear infinite;
	}
	@keyframes shimmer {
		to {
			background-position: -150% 0;
		}
	}
	:global(.guest-handle) {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: var(--color-b);
		border: 3px solid var(--color-card);
		box-shadow: 0 4px 14px -2px rgb(255 46 136 / 0.6);
		cursor: grab;
		touch-action: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3'/%3E%3C/svg%3E");
		background-size: 60%;
		background-repeat: no-repeat;
		background-position: center;
	}
	:global(.guest-handle.hidden) {
		display: none;
	}
	@media (max-width: 640px) {
		.frame {
			height: 72svh;
		}
		.tools {
			bottom: 2.4rem;
		}
		.frame :global(.maplibregl-ctrl-group) {
			display: none;
		}

	}
</style>
