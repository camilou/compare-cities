<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import CityPicker, { type Pick } from '$lib/components/CityPicker.svelte';
	import CompareMap from '$lib/components/CompareMap.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ShareSheet from '$lib/components/ShareSheet.svelte';
	import { cardInput } from '$lib/share/card';
	import { areaKm2, mainland } from '$lib/geo';
	import MonthlyChart from '$lib/components/MonthlyChart.svelte';
	import { CLIMATE_SOURCE, MONTHS } from '$lib/climate';
	import { fetchCity, cityClimate, cityTransit, cityGreen } from '$lib/citystats';
	import {
		derive, rows, funFacts, fetchWeather, weatherIcon, countryOf, num, km2, dataUpdated,
		type Side,
		type Pending
	} from '$lib/compare';
	import type { City } from '$lib/types';

	let { data } = $props();
	const DEFAULTS = { a: 'R175905', b: 'R7444' }; // New York, Paris (the server usually picks the visitor's city)

	let pickerHeight = $state(0);

	type Slot = 'a' | 'b';
	let sides = $state<Record<Slot, Side | undefined>>({ a: undefined, b: undefined });
	let loading = $state<Record<Slot, boolean>>({ a: false, b: false });
	let errors = $state<Record<Slot, string | undefined>>({ a: undefined, b: undefined });
	const tokens: Record<Slot, number> = { a: 0, b: 0 };
	// Keyed by city id so in-flight lookups land on the right side even after a swap.
	let pending = $state<Record<string, Pending>>({});

	function patch(id: string, p: Partial<Side>) {
		for (const slot of ['a', 'b'] as const) {
			const s = sides[slot];
			if (s?.city.id === id) sides[slot] = { ...s, ...p };
		}
	}

	function loadExtras(s: Side) {
		const id = s.city.id;
		if (pending[id]) return;
		pending[id] = { transit: true, green: true, climate: true };
		const done = (k: keyof Pending) => (pending[id] = { ...pending[id], [k]: false });
		fetchWeather(s.city.center).then((weather) => weather && patch(id, { weather }));
		cityClimate(s.city)
			.then((climate) => patch(id, { climate }))
			.catch(() => {})
			.finally(() => done('climate'));
		cityTransit(s.city)
			.then((transit) => patch(id, { transit }))
			.catch(() => {})
			.finally(() => done('transit'));
		cityGreen(s.city, s.shape, s.areaKm2)
			.then((green) => patch(id, { green }))
			.catch(() => {})
			.finally(() => done('green'));
	}

	async function load(slot: Slot, pick: Pick) {
		const token = ++tokens[slot];
		loading[slot] = true;
		errors[slot] = undefined;
		try {
			const city: City = await fetchCity(pick);
			if (token !== tokens[slot]) return;
			const shape = mainland(city.geometry, city.center);
			const side: Side = { city, shape, areaKm2: areaKm2(shape) };
			sides[slot] = side;
			syncUrl();
			delete pending[city.id];
			loadExtras(side);
			return true;
		} catch (e) {
			if (token === tokens[slot]) errors[slot] = e instanceof Error ? e.message : String(e);
			return false;
		} finally {
			if (token === tokens[slot]) loading[slot] = false;
		}
	}

	function syncUrl() {
		const url = new URL(page.url);
		if (sides.a) url.searchParams.set('a', sides.a.city.id);
		if (sides.b) url.searchParams.set('b', sides.b.city.id);
		try {
			replaceState(url, {});
		} catch {
			/* router not ready yet */
		}
	}

	function swap() {
		[sides.a, sides.b] = [sides.b, sides.a];
		syncUrl();
	}

	onMount(() => {
		// The server picks the visitor's own city for the left side when the URL doesn't say.
		const a = data.start?.a ?? { id: page.url.searchParams.get('a') ?? DEFAULTS.a };
		load('a', a).then((ok) => {
			// A small town we can't outline: quietly fall back to the default pair.
			if (!ok && 'q' in a && !sides.a && !loading.a) {
				errors.a = undefined;
				load('a', { id: DEFAULTS.a });
			}
		});
		load('b', data.start?.b ?? { id: page.url.searchParams.get('b') ?? DEFAULTS.b });
	});

	const A = $derived(sides.a);
	const B = $derived(sides.b);
	const dA = $derived(A && derive(A));
	const dB = $derived(B && derive(B));
	const table = $derived(
		A && B && dA && dB ? rows(A, B, dA, dB, { a: pending[A.city.id] ?? {}, b: pending[B.city.id] ?? {} }) : []
	);
	const slowTransit = $derived(table.some((r) => r.pending && r.group === 'Getting around'));
	const flipped = $derived(A && B && Math.sign(A.city.center[1]) !== Math.sign(B.city.center[1]));
	const facts = $derived(A && B && dA && dB ? funFacts(A, B, dA, dB) : []);

	const verdict = $derived.by(() => {
		if (!A || !B) return undefined;
		const [big, small] = A.areaKm2 >= B.areaKm2 ? [A, B] : [B, A];
		const ratio = big.areaKm2 / small.areaKm2;
		return { big: big === A ? 'a' : 'b', small: small === A ? 'a' : 'b', ratio, near: ratio < 1.15 } as const;
	});

	const localTime = (s?: Side) =>
		s?.weather
			? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: s.weather.timezone }).format(new Date())
			: undefined;

	let sheet = $state<ShareSheet>();
	const card = $derived.by(() => {
		if (!A || !B) return undefined;
		const side = (s: Side) => ({
			name: s.city.name,
			shape: s.shape,
			center: s.city.center,
			areaKm2: s.areaKm2,
			population: s.city.facts.population?.value
		});
		return cardInput(side(A), side(B), page.url.host);
	});

	const shapeOf = (s?: Side) =>
		s && { key: s.city.id, name: s.city.name, shape: s.shape, center: s.city.center, areaKm2: s.areaKm2 };

	const title = $derived(A && B ? `${A.city.name} vs ${B.city.name}: true size compared` : data.meta.title);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={data.meta.description} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Compare cities" />
	<meta property="og:title" content={data.meta.title} />
	<meta property="og:description" content={data.meta.description} />
	<meta property="og:url" content={page.url.href} />
	{#if data.meta.image}
		<meta property="og:image" content={data.meta.image} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content={data.meta.description} />
		<meta name="twitter:image" content={data.meta.image} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.meta.title} />
	<meta name="twitter:description" content={data.meta.description} />
</svelte:head>

<div class="page top">
	<header class="masthead">
		<a href="/" class="brand" aria-label="Compare cities, home">
			<Logo size={38} />
			<span class="wordmark">Compare<br />cities</span>
		</a>
		<p class="tagline">Every city at its true size and shape.</p>
		<div class="actions">
			{#if card}
				<button class="share-pill" onclick={() => sheet?.open()}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
					<span>Share</span>
				</button>
			{/if}
			<ThemeToggle />
		</div>
	</header>
	{#if card}<ShareSheet bind:this={sheet} input={card} url={page.url.href} />{/if}

</div>

<section class="stage" aria-label="Map comparison">
	<CompareMap home={shapeOf(A)} guest={shapeOf(B)} topInset={pickerHeight} />
	<div class="pickers" bind:clientHeight={pickerHeight} role="group" aria-label="Choose two cities">
		<div class="slot">
			<CityPicker
				label="Base city"
				tone="a"
				value={A?.city.name}
				meta={A && km2(A.areaKm2)}
				loading={loading.a}
				onpick={(p) => load('a', p)}
			/>
			{#if errors.a}<p class="error" role="alert">{errors.a}</p>{/if}
		</div>
		<button class="swap" onclick={swap} disabled={!A || !B} aria-label="Swap the two cities">
			<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>
		</button>
		<div class="slot">
			<CityPicker
				label="City to lay on top"
				tone="b"
				value={B?.city.name}
				meta={B && km2(B.areaKm2)}
				loading={loading.b}
				onpick={(p) => load('b', p)}
			/>
			{#if errors.b}<p class="error" role="alert">{errors.b}</p>{/if}
		</div>
	</div>
</section>

<div class="page">
	<p class="maphint">
		Drag {B ? B.city.name : 'the second city'} or its handle to move it around. Its size and shape stay true wherever you drop it.
	</p>

	{#if A && B && verdict && dA && dB}
		{@const big = sides[verdict.big]!}
		{@const small = sides[verdict.small]!}
		<section class="verdict" aria-live="polite">
			<h1>
				{#if verdict.near}
					<span class="c-{verdict.big}">{big.city.name}</span> and <span class="c-{verdict.small}">{small.city.name}</span>
					are about the same size.
				{:else if verdict.ratio < 1.95}
					<span class="c-{verdict.big}">{big.city.name}</span> is {num((verdict.ratio - 1) * 100)}% bigger than
					<span class="c-{verdict.small}">{small.city.name}</span>.
				{:else}
					<span class="c-{verdict.big}">{big.city.name}</span> is {num(verdict.ratio, verdict.ratio < 10 ? 1 : 0)}× the size of
					<span class="c-{verdict.small}">{small.city.name}</span>.
				{/if}
			</h1>
			{#if dA.density && dB.density}
				{@const [dense, sparse] = dA.density >= dB.density ? [A, B] : [B, A]}
				{@const r = Math.max(dA.density, dB.density) / Math.min(dA.density, dB.density)}
				<p>
					{#if r < 1.15}
						Both pack roughly the same number of people into each square kilometre.
					{:else}
						{dense.city.name} packs {num(r, 1)} times as many people into each square kilometre as {sparse.city.name}.
					{/if}
				</p>
			{/if}
			<button class="share-big" onclick={() => sheet?.open()}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
				Share this comparison
			</button>
		</section>

		<section class="block" aria-labelledby="facts-h">
			<h2 id="facts-h">Fun facts</h2>
			<ul class="facts">
				{#each facts as f (f.text)}
					<li><span class="icon" aria-hidden="true">{f.icon}</span><span>{f.text}</span></li>
				{/each}
			</ul>
		</section>

		<section class="block" aria-labelledby="numbers-h">
			<h2 id="numbers-h">Side by side</h2>
			<div class="rows-head" aria-hidden="true">
				<span><i class="key a"></i>{A.city.name}</span>
				<span><i class="key b"></i>{B.city.name}</span>
			</div>
			<dl class="rows">
				{#each table as r, i (r.key)}
					{@const max = Math.max(r.a ?? 0, r.b ?? 0) || 1}
					{#if r.group !== table[i - 1]?.group}
						<div class="group">
							<h3>{r.group}</h3>
							{#if r.group === 'Getting around' && slowTransit}
								<p>Counting stations and lanes in OpenStreetMap. The first look at a city can take a minute.</p>
							{/if}
						</div>
					{/if}
					<div class="row" class:pending={r.pending}>
						<dt>
							<span class="label">{r.label}</span>
							{#if r.note}<span class="note">{r.note}</span>{/if}
						</dt>
						{#if r.pending}
							<dd class="val a"><span class="skeleton"></span></dd>
							<dd class="bars" aria-hidden="true"><span class="bar skel"></span><span class="bar skel"></span></dd>
							<dd class="val b"><span class="skeleton"></span></dd>
						{:else}
							<dd class="val a tnum">{r.fmtA ?? '—'}</dd>
							<dd class="bars" aria-hidden="true">
								<span class="bar a" style:--w={(r.a ?? 0) / max}></span>
								<span class="bar b" style:--w={(r.b ?? 0) / max}></span>
							</dd>
							<dd class="val b tnum">{r.fmtB ?? '—'}</dd>
						{/if}
					</div>
				{/each}
			</dl>
		</section>

		<section class="block" aria-labelledby="climate-h">
			<div class="block-head">
				<h2 id="climate-h">Climate through the year</h2>
				<p class="legend">
					<span><i class="key a"></i>{A.city.name}</span>
					<span><i class="key b"></i>{B.city.name}</span>
				</p>
			</div>
			{#if A.climate && B.climate}
				{@const series = (k: 'temp' | 'rain' | 'cloud') => [
					{ key: 'a' as const, label: A.city.name, values: A.climate![k] },
					{ key: 'b' as const, label: B.city.name, values: B.climate![k] }
				]}
				<div class="charts">
					<MonthlyChart title="Average temperature" kind="line" series={series('temp')} fmt={(n) => `${num(n, 1)}°`} />
					<MonthlyChart title="Rain" kind="bar" series={series('rain')} fmt={(n) => `${num(n)} mm`} />
					<MonthlyChart title="Cloud cover" kind="line" series={series('cloud')} fmt={(n) => `${num(n)}%`} />
				</div>
				<p class="source">
					{CLIMATE_SOURCE}.
					{#if flipped}Their seasons run opposite: one city is south of the equator.{/if}
				</p>
				<details class="table-view">
					<summary>Show as a table</summary>
					<div class="table-scroll">
						<table>
							<thead>
								<tr><th>Month</th><th colspan="3">{A.city.name}</th><th colspan="3">{B.city.name}</th></tr>
								<tr><th></th><th>°C</th><th>mm</th><th>cloud</th><th>°C</th><th>mm</th><th>cloud</th></tr>
							</thead>
							<tbody>
								{#each MONTHS as m, i (m)}
									<tr>
										<th>{m}</th>
										<td>{num(A.climate.temp[i], 1)}</td><td>{A.climate.rain[i]}</td><td>{A.climate.cloud[i]}%</td>
										<td>{num(B.climate.temp[i], 1)}</td><td>{B.climate.rain[i]}</td><td>{B.climate.cloud[i]}%</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{:else if pending[A.city.id]?.climate || pending[B.city.id]?.climate}
				<div class="charts">
					{#each [0, 1, 2] as i (i)}<div class="chart-skel"></div>{/each}
				</div>
			{:else}
				<p class="source">Climate data is unavailable right now.</p>
			{/if}
		</section>

		<section class="block about" aria-label="About the cities">
			{#each [A, B] as s, i (s.city.id)}
				{@const c = countryOf(s.city)}
				<article class="city" data-side={i === 0 ? 'a' : 'b'}>
					{#if s.city.summary?.image}
						<img src={s.city.summary.image} alt="" loading="lazy" />
					{/if}
					<div class="city-body">
						<h3>{s.city.name}</h3>
						<p class="where">{c?.name ?? s.city.country}</p>
						{#if s.weather}
							<p class="now tnum">
								<span>{weatherIcon(s.weather.code)} {num(s.weather.tempC)} °C</span>
								<span>{localTime(s)} local time</span>
							</p>
						{/if}
						{#if s.city.summary?.extract}<p class="extract">{s.city.summary.extract}</p>{/if}
						{#if s.city.facts.mayor}<p class="meta">Mayor: {s.city.facts.mayor}</p>{/if}
						{#if s.city.summary?.url}
							<a href={s.city.summary.url} target="_blank" rel="noopener">Read more on Wikipedia</a>
						{/if}
					</div>
				</article>
			{/each}
		</section>
	{/if}

	<footer>
		<p>
			Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by
			<a href="https://openfreemap.org">OpenFreeMap</a>. Boundaries from Nominatim, facts from Wikidata and Wikipedia,
			weather from Open-Meteo, country data from the World Bank and The Economist’s Big Mac index (data {dataUpdated}).
			Car counts and salaries are rough estimates.
		</p>
	</footer>
</div>

<style>
	.page {
		max-width: 1120px;
		margin: 0 auto;
		padding: 0 1rem 3rem;
	}
	.page.top {
		padding-top: max(1rem, env(safe-area-inset-top));
		padding-bottom: 0;
	}
	.masthead {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 0.25rem 0 1rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.wordmark {
		font-size: 1.15rem;
		line-height: 0.95;
		font-weight: 800;
		font-stretch: 78%;
		letter-spacing: -0.01em;
		text-transform: lowercase;
	}
	.tagline {
		color: var(--color-muted);
		padding-left: 1rem;
		border-left: 1px solid var(--color-line);
		font-size: 0.95rem;
		line-height: 1.3;
	}
	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.share-pill,
	.share-big {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 999px;
		font-weight: 650;
	}
	.share-pill {
		height: 2.6rem;
		padding: 0 1rem 0 0.85rem;
		background: var(--color-card);
		box-shadow: var(--shadow);
	}
	.share-big {
		margin-top: 1.25rem;
		padding: 0.8rem 1.3rem 0.8rem 1.1rem;
		background: var(--color-ink);
		color: var(--color-paper);
		box-shadow: var(--shadow);
		transition: transform 0.15s;
	}
	.share-big:hover {
		transform: translateY(-1px);
	}
	.share-pill svg,
	.share-big svg {
		width: 1.15rem;
		height: 1.15rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	@media (max-width: 520px) {
		.tagline {
			display: none;
		}
	}
	.stage {
		position: relative;
	}
	.pickers {
		position: absolute;
		z-index: 20;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(820px, calc(100% - 2rem));
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: start;
		gap: 0.6rem;
	}
	.swap {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		border-radius: 50%;
		background: var(--color-ink);
		color: var(--color-paper);
		box-shadow: var(--shadow);
		transition: transform 0.25s;
	}
	.swap:hover:not(:disabled) {
		transform: rotate(180deg);
	}
	.swap:disabled {
		opacity: 0.4;
	}
	.swap svg {
		width: 1.3rem;
		height: 1.3rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.error {
		margin: 0.4rem 0.5rem 0;
		padding: 0.3rem 0.75rem;
		border-radius: 0.6rem;
		background: var(--color-glass);
		font-size: 0.9rem;
		color: var(--color-error);
	}
	.maphint {
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.c-a {
		color: var(--color-a);
	}
	.c-b {
		color: var(--color-b);
	}

	.verdict {
		margin: 2.5rem 0 1rem;
	}
	.verdict h1 {
		font-size: clamp(2rem, 5.5vw, 4rem);
		line-height: 1.02;
		font-weight: 780;
		letter-spacing: -0.035em;
		text-wrap: balance;
	}
	.verdict p {
		margin-top: 0.9rem;
		font-size: 1.2rem;
		color: var(--color-muted);
		text-wrap: pretty;
	}

	.block {
		margin-top: 3rem;
	}
	.block h2 {
		font-size: 1.5rem;
		font-weight: 750;
		letter-spacing: -0.02em;
		margin-bottom: 1rem;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
		gap: 0.75rem;
	}
	.facts li {
		display: flex;
		gap: 0.8rem;
		align-items: flex-start;
		padding: 1rem 1.1rem;
		background: var(--color-card);
		border-radius: 1.1rem;
		line-height: 1.45;
		text-wrap: pretty;
	}
	.facts .icon {
		font-size: 1.4rem;
		line-height: 1;
	}

	.rows-head {
		display: grid;
		grid-template-columns: 1fr 1fr;
		font-weight: 700;
		padding: 0 0.25rem 0.5rem;
	}
	.rows-head span:last-child {
		justify-self: end;
	}
	.key {
		display: inline-block;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		margin-right: 0.4rem;
		background: var(--color-a);
	}
	.key.b {
		background: var(--color-b);
	}
	.rows {
		background: var(--color-card);
		border-radius: 1.25rem;
		padding: 0.25rem 1.1rem;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		grid-template-areas:
			'label label label'
			'va bars vb';
		align-items: center;
		column-gap: 0.75rem;
		padding: 0.9rem 0;
		border-top: 1px solid var(--color-line);
	}
	.row:first-child {
		border-top: 0;
	}
	dt {
		grid-area: label;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0 0.5rem;
		text-align: center;
		margin-bottom: 0.4rem;
	}
	.label {
		font-weight: 650;
	}
	.note {
		font-size: 0.8rem;
		color: var(--color-muted);
		align-self: center;
	}
	.val {
		font-size: 1.15rem;
		font-weight: 650;
	}
	.val.a {
		grid-area: va;
	}
	.val.b {
		grid-area: vb;
		text-align: right;
	}
	.bars {
		grid-area: bars;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3px;
		width: clamp(72px, 34vw, 360px);
		height: 0.7rem;
	}
	.bar {
		height: 100%;
		border-radius: 999px;
		transform: scaleX(var(--w));
		transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.bar.a {
		background: var(--color-a);
		transform-origin: right;
	}
	.bar.b {
		background: var(--color-b);
		transform-origin: left;
	}

	.about {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: 0.75rem;
	}
	.city {
		background: var(--color-card);
		border-radius: 1.25rem;
		overflow: hidden;
		border-top: 6px solid var(--color-a);
	}
	.city[data-side='b'] {
		border-top-color: var(--color-b);
	}
	.city img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
	}
	.city-body {
		padding: 1.1rem 1.25rem 1.3rem;
	}
	.city h3 {
		font-size: 1.5rem;
		font-weight: 750;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.where {
		color: var(--color-muted);
	}
	.now {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin-top: 0.6rem;
		font-weight: 600;
	}
	.extract {
		margin-top: 0.75rem;
		max-width: 65ch;
		display: -webkit-box;
		-webkit-line-clamp: 6;
		line-clamp: 6;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		margin-top: 0.6rem;
		font-size: 0.9rem;
		color: var(--color-muted);
	}
	.city a {
		display: inline-block;
		margin-top: 0.75rem;
		font-weight: 650;
		color: var(--color-a);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.city[data-side='b'] a {
		color: var(--color-b-text);
	}

	.group {
		padding: 1.4rem 0 0.2rem;
		border-top: 1px solid var(--color-line);
	}
	.rows .group:first-child {
		border-top: 0;
		padding-top: 0.8rem;
	}
	.group h3 {
		font-size: 1.05rem;
		font-weight: 750;
	}
	.group p {
		font-size: 0.85rem;
		color: var(--color-muted);
	}
	.group + .row {
		border-top: 0;
	}
	.skeleton,
	.bar.skel,
	.chart-skel {
		background: linear-gradient(100deg, var(--color-line) 30%, var(--color-paper) 50%, var(--color-line) 70%) 0 0 / 300% 100%;
		animation: shimmer 1.4s linear infinite;
	}
	.skeleton {
		display: inline-block;
		width: 4rem;
		height: 1rem;
		border-radius: 0.4rem;
		vertical-align: middle;
	}
	.bar.skel {
		transform: none;
	}
	.chart-skel {
		height: 270px;
		border-radius: 1.25rem;
	}
	@keyframes shimmer {
		to {
			background-position: -150% 0;
		}
	}
	.block-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem 1.5rem;
		margin-bottom: 1rem;
	}
	.block-head h2 {
		margin-bottom: 0;
	}
	.legend {
		display: flex;
		gap: 1.25rem;
		font-weight: 650;
	}
	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: 0.75rem;
	}
	.source {
		margin-top: 0.75rem;
		font-size: 0.85rem;
		color: var(--color-muted);
	}
	.table-view {
		margin-top: 0.5rem;
		font-size: 0.9rem;
	}
	.table-view summary {
		cursor: pointer;
		font-weight: 650;
		color: var(--color-muted);
	}
	.table-scroll {
		overflow-x: auto;
		margin-top: 0.5rem;
		background: var(--color-card);
		border-radius: 1rem;
		padding: 0.5rem 0.75rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		padding: 0.3rem 0.6rem;
		text-align: right;
		border-bottom: 1px solid var(--color-line);
	}
	tbody th {
		text-align: left;
	}
	footer {
		margin-top: 4rem;
		font-size: 0.85rem;
		color: var(--color-muted);
		max-width: 75ch;
	}
	footer a {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	@media (max-width: 640px) {
		.pickers {
			top: 0.75rem;
			width: calc(100% - 1.5rem);
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'a swap' 'b swap';
			gap: 0.4rem;
		}
		.pickers > .slot:first-child {
			grid-area: a;
		}
		.pickers > .slot:last-child {
			grid-area: b;
		}
		.swap {
			grid-area: swap;
			align-self: center;
			width: 2.75rem;
			height: 2.75rem;
			transform: rotate(90deg);
		}
		.swap:hover:not(:disabled) {
			transform: rotate(270deg);
		}
		.verdict {
			margin-top: 1.75rem;
		}
		.rows {
			padding: 0.25rem 0.9rem;
		}
		.val {
			font-size: 1rem;
		}
	}
</style>
