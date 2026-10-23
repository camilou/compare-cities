<script lang="ts" module>
	export type Pick = { id: string } | { q: string };
</script>

<script lang="ts">
	import type { Suggestion } from '$lib/types';

	let {
		label,
		tone,
		value,
		meta,
		loading = false,
		onpick
	}: {
		label: string;
		tone: 'a' | 'b';
		value?: string;
		meta?: string;
		loading?: boolean;
		onpick: (p: Pick) => void;
	} = $props();

	const POPULAR = ['Bogotá', 'Medellín', 'Paris', 'New York City', 'London', 'Tokyo', 'Mexico City', 'Madrid', 'Buenos Aires', 'Singapore'];

	const uid = $props.id();
	let query = $state('');
	let open = $state(false);
	let active = $state(0);
	let results = $state<Suggestion[]>([]);
	let searching = $state(false);
	let timer: ReturnType<typeof setTimeout>;
	let controller: AbortController | undefined;
	let input: HTMLInputElement;

	type Option = { key: string; title: string; sub?: string; pick: Pick };
	const options = $derived<Option[]>(
		query.trim().length >= 2
			? results.map((r) => ({ key: r.id, title: r.name, sub: r.context, pick: { id: r.id } }))
			: POPULAR.filter((p) => p !== value).map((p) => ({ key: p, title: p, pick: { q: p } }))
	);

	function search(q: string) {
		clearTimeout(timer);
		controller?.abort();
		if (q.trim().length < 2) {
			results = [];
			return;
		}
		timer = setTimeout(async () => {
			controller = new AbortController();
			searching = true;
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
				results = res.ok ? await res.json() : [];
				active = 0;
			} catch {
				/* aborted or offline: keep previous results */
			} finally {
				searching = false;
			}
		}, 220);
	}

	function choose(o: Option) {
		onpick(o.pick);
		query = '';
		results = [];
		open = false;
		input.blur();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			open = true;
			active = (active + 1) % Math.max(options.length, 1);
			e.preventDefault();
		} else if (e.key === 'ArrowUp') {
			active = (active - 1 + options.length) % Math.max(options.length, 1);
			e.preventDefault();
		} else if (e.key === 'Enter') {
			const o = options[active];
			if (o) choose(o);
			else if (query.trim()) choose({ key: query, title: query, pick: { q: query.trim() } });
			e.preventDefault();
		} else if (e.key === 'Escape') {
			open = false;
			input.blur();
		}
	}
</script>

<div class="picker" data-tone={tone}>
	<label for="{uid}-input" class="sr-only">{label}</label>
	<span class="dot" aria-hidden="true"></span>
	<input
		bind:this={input}
		id="{uid}-input"
		type="text"
		role="combobox"
		autocomplete="off"
		spellcheck="false"
		aria-expanded={open}
		aria-controls="{uid}-list"
		aria-activedescendant={open && options[active] ? `${uid}-${active}` : undefined}
		placeholder={loading ? 'Loading…' : (value ?? 'Search a city')}
		class:has-value={!!value && !loading}
		bind:value={query}
		oninput={() => {
			open = true;
			search(query);
		}}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 120)}
		{onkeydown}
	/>
	{#if loading || searching}
		<span class="spinner" aria-hidden="true"></span>
	{:else if meta && !query}
		<span class="meta tnum">{meta}</span>
	{/if}

	{#if open && options.length}
		<ul id="{uid}-list" role="listbox" aria-label={label}>
			{#if query.trim().length < 2}
				<li class="hint" role="presentation">Popular</li>
			{/if}
			{#each options as o, i (o.key)}
				<li
					id="{uid}-{i}"
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onpointerdown={(e) => {
						e.preventDefault();
						choose(o);
					}}
					onpointerenter={() => (active = i)}
				>
					<span class="title">{o.title}</span>
					{#if o.sub}<span class="sub">{o.sub}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.picker {
		--tone: var(--color-a);
		--tone-soft: var(--color-a-soft);
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--color-glass);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 2px solid var(--tone-soft);
		border-radius: 999px;
		box-shadow: var(--shadow);
		padding: 0 1rem;
		height: 3.25rem;
		transition: border-color 0.15s;
	}
	.picker[data-tone='b'] {
		--tone: var(--color-b);
		--tone-soft: var(--color-b-soft);
	}
	.picker:focus-within {
		border-color: var(--tone);
	}
	.dot {
		flex: none;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		background: var(--tone);
	}
	input {
		flex: 1;
		min-width: 0;
		background: none;
		border: 0;
		outline: none;
		font: inherit;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-ink);
	}
	input.has-value::placeholder {
		color: var(--color-ink);
		opacity: 1;
	}
	input:focus.has-value::placeholder {
		color: var(--color-muted);
		opacity: 0.6;
	}
	.meta {
		flex: none;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-muted);
	}
	.spinner {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid var(--tone-soft);
		border-top-color: var(--tone);
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}
	ul {
		position: absolute;
		z-index: 30;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.35rem;
		list-style: none;
		background: var(--color-card);
		border-radius: 1.1rem;
		box-shadow:
			0 1px 0 var(--color-line),
			0 18px 40px -12px rgb(29 33 66 / 0.28);
		max-height: 22rem;
		overflow: auto;
	}
	li[role='option'] {
		display: flex;
		flex-direction: column;
		padding: 0.55rem 0.8rem;
		border-radius: 0.75rem;
		cursor: pointer;
	}
	li.active {
		background: var(--tone-soft);
	}
	.title {
		font-weight: 600;
	}
	.sub {
		font-size: 0.85rem;
		color: var(--color-muted);
	}
	.hint {
		padding: 0.4rem 0.8rem 0.2rem;
		font-size: 0.8rem;
		color: var(--color-muted);
	}
</style>
