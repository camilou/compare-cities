<script lang="ts">
	import { MONTHS } from '$lib/climate';

	interface Series {
		key: 'a' | 'b';
		label: string;
		values: number[];
	}

	let {
		title,
		kind,
		series,
		fmt,
		zero = kind === 'bar'
	}: {
		title: string;
		kind: 'line' | 'bar';
		series: Series[];
		fmt: (n: number) => string;
		zero?: boolean;
	} = $props();

	const H = 210;
	const M = { top: 10, right: 10, bottom: 26, left: 40 };
	let width = $state(320);
	let active = $state<number | null>(null);

	const all = $derived(series.flatMap((s) => s.values));
	const ticks = $derived.by(() => {
		let lo = Math.min(...all);
		let hi = Math.max(...all);
		if (zero) lo = Math.min(0, lo);
		if (hi === lo) hi = lo + 1;
		const raw = (hi - lo) / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
		const start = Math.floor(lo / step) * step;
		const out: number[] = [];
		for (let v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
		if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
		return out;
	});
	const y0 = $derived(ticks[0]);
	const y1 = $derived(ticks[ticks.length - 1]);
	const plotW = $derived(Math.max(10, width - M.left - M.right));
	const plotH = H - M.top - M.bottom;
	const band = $derived(plotW / 12);
	const x = (m: number) => M.left + band * (m + 0.5);
	const y = (v: number) => M.top + plotH - ((v - y0) / (y1 - y0)) * plotH;

	const linePath = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');

	/** Bar with 4px rounded data-end, square at the baseline. */
	function barPath(cx: number, w: number, v: number) {
		const base = y(Math.max(y0, 0));
		const top = y(v);
		const h = base - top;
		const r = Math.min(4, w / 2, Math.abs(h));
		const l = cx - w / 2;
		if (h <= 0) return '';
		return `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${l + w - r}Q${l + w},${top} ${l + w},${top + r}V${base}Z`;
	}
	const barW = $derived(Math.max(2, Math.min(14, (band - 6) / 2)));

	const valueText = $derived.by(() => {
		const i = active ?? 0;
		return `${MONTHS[i]}: ` + series.map((s) => `${s.label} ${fmt(s.values[i])}`).join(', ');
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') active = ((active ?? -1) + 1) % 12;
		else if (e.key === 'ArrowLeft') active = ((active ?? 12) + 11) % 12;
		else if (e.key === 'Escape') active = null;
		else return;
		e.preventDefault();
	}
</script>

<figure class="chart">
	<figcaption>{title}</figcaption>
	<div
		class="plot"
		bind:clientWidth={width}
		role="slider"
		aria-label="{title} by month"
		aria-valuemin={1}
		aria-valuemax={12}
		aria-valuenow={(active ?? 0) + 1}
		aria-valuetext={valueText}
		tabindex="0"
		{onkeydown}
		onblur={() => (active = null)}
	>
		<svg {width} height={H} aria-hidden="true">
			<g class="grid">
				{#each ticks as t (t)}
					<line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} class:base={t === 0 && zero} />
					<text x={M.left - 8} y={y(t)} dy="0.32em" text-anchor="end">{fmt(t)}</text>
				{/each}
				{#each MONTHS as m, i (m)}
					{#if width > 420 || i % 2 === 0}
						<text x={x(i)} y={H - 6} text-anchor="middle">{width > 420 ? m : m[0]}</text>
					{/if}
				{/each}
			</g>

			{#if active !== null}
				<rect class="hover-band" x={M.left + band * active} y={M.top} width={band} height={plotH} />
			{/if}

			{#if kind === 'bar'}
				{#each series as s, si (s.key)}
					{#each s.values as v, i (i)}
						<path class="bar {s.key}" d={barPath(x(i) + (si === 0 ? -1 : 1) * (barW / 2 + 1), barW, v)} />
					{/each}
				{/each}
			{:else}
				{#each series as s (s.key)}
					<path class="line {s.key}" d={linePath(s.values)} />
					{#each s.values as v, i (i)}
						<circle class="dot {s.key}" cx={x(i)} cy={y(v)} r={active === i ? 5 : 3.5} />
					{/each}
				{/each}
			{/if}

			{#each MONTHS as m, i (m)}
				<rect
					class="hit"
					x={M.left + band * i}
					y={M.top}
					width={band}
					height={plotH + M.bottom}
					role="presentation"
					onpointerenter={() => (active = i)}
					onpointerleave={() => (active = null)}
				/>
			{/each}
		</svg>

		{#if active !== null}
			{@const i = active}
			<div class="tip" style:left="{Math.min(Math.max(x(i), 70), width - 70)}px" role="status">
				<b>{MONTHS[i]}</b>
				{#each series as s (s.key)}
					<span><i class="key {s.key}"></i>{s.label}<em class="tnum">{fmt(s.values[i])}</em></span>
				{/each}
			</div>
		{/if}
	</div>
</figure>

<style>
	.chart {
		background: var(--color-card);
		border-radius: 1.25rem;
		padding: 1rem 1rem 0.5rem;
		min-width: 0;
	}
	figcaption {
		font-weight: 650;
		margin-bottom: 0.25rem;
	}
	.plot {
		position: relative;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.plot:focus-visible {
		outline-offset: 4px;
	}
	.grid line {
		stroke: var(--color-line);
		stroke-width: 1;
	}
	.grid line.base {
		stroke: var(--color-muted);
		opacity: 0.5;
	}
	.grid text {
		fill: var(--color-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.hover-band {
		fill: var(--color-ink);
		opacity: 0.05;
	}
	.line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.line.a,
	.dot.a,
	.bar.a {
		stroke: var(--color-a);
	}
	.line.b,
	.dot.b,
	.bar.b {
		stroke: var(--color-b);
	}
	.dot {
		stroke: var(--color-card) !important;
		stroke-width: 2;
		transition: r 0.12s;
	}
	.dot.a,
	.bar.a {
		fill: var(--color-a);
	}
	.dot.b,
	.bar.b {
		fill: var(--color-b);
	}
	.bar {
		stroke: none !important;
	}
	.hit {
		fill: transparent;
	}
	.tip {
		position: absolute;
		top: 0;
		transform: translate(-50%, -100%);
		display: grid;
		gap: 0.1rem;
		min-width: 9.5rem;
		padding: 0.5rem 0.7rem;
		background: var(--color-ink);
		color: var(--color-paper);
		border-radius: 0.7rem;
		font-size: 0.85rem;
		pointer-events: none;
		box-shadow: var(--shadow);
		z-index: 5;
	}
	.tip span {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.tip em {
		margin-left: auto;
		padding-left: 0.75rem;
		font-style: normal;
		font-weight: 650;
	}
	.key {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--color-a);
		box-shadow: 0 0 0 1.5px var(--color-paper);
	}
	.key.b {
		background: var(--color-b);
	}
</style>
