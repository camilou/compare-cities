<!-- Temporary: pick a wordmark font for the Contour logo. Delete this route once chosen. -->
<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';

	const FONTS = [
		{ name: 'Bricolage Grotesque', css: "'Bricolage Grotesque Variable'", weight: 800, stretch: '78%', note: 'Current. Quirky grotesque, squeezed narrow.' },
		{ name: 'Big Shoulders Display', css: "'Big Shoulders Display'", weight: 800, note: 'Tall and condensed, born from Chicago street signage. Very "city".' },
		{ name: 'Fraunces', css: "'Fraunces'", weight: 700, note: 'Soft, old-style serif. Feels like a vintage atlas.' },
		{ name: 'Unbounded', css: "'Unbounded'", weight: 700, note: 'Wide and geometric. Loud, modern, a bit techy.' },
		{ name: 'Syne', css: "'Syne'", weight: 800, note: 'Art-gallery quirky with odd, stretched letterforms.' },
		{ name: 'Instrument Serif', css: "'Instrument Serif'", weight: 400, italic: true, note: 'Elegant condensed serif in italic. Editorial, calm.' },
		{ name: 'Archivo Expanded', css: "'Archivo'", weight: 800, stretch: '125%', note: 'Wide caps like the labels on a printed map.' },
		{ name: 'Bagel Fat One', css: "'Bagel Fat One'", weight: 400, note: 'Chunky and round. Friendly, playful, unserious.' }
	];
	const style = (f: (typeof FONTS)[number]) =>
		`font-family:${f.css},sans-serif;font-weight:${f.weight};font-stretch:${f.stretch ?? '100%'};font-style:${f.italic ? 'italic' : 'normal'}`;
</script>

<svelte:head>
	<title>Wordmark fonts · Compare cities</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=Fraunces:opsz,wght@9..144,700&family=Unbounded:wght@700&family=Syne:wght@800&family=Instrument+Serif:ital@1&family=Archivo:wdth,wght@125,800&family=Bagel+Fat+One&display=swap"
	/>
</svelte:head>

<main>
	<h1>Wordmark fonts for Contour</h1>
	<p class="lede">The same mark with eight typefaces, in the two-line and one-line lockups, on light and dark.</p>

	<div class="grid">
		{#each FONTS as f, i (f.name)}
			<section>
				<header>
					<h2>{i + 1}. {f.name}</h2>
					<p>{f.note}</p>
				</header>
				<div class="pair">
					<div class="lockup light" data-theme="light">
						<Logo variant="contour" size={44} />
						<span class="stack" style={style(f)}>compare<br />cities</span>
					</div>
					<div class="lockup dark" data-theme="dark">
						<Logo variant="contour" size={44} />
						<span class="stack" style={style(f)}>compare<br />cities</span>
					</div>
				</div>
				<div class="lockup light wide" data-theme="light">
					<Logo variant="contour" size={34} />
					<span class="line" style={style(f)}>compare cities</span>
				</div>
				<p class="sample" style={style(f)}>Bogotá is 3.8× the size of Paris.</p>
			</section>
		{/each}
	</div>
</main>

<style>
	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.lede {
		color: var(--color-muted);
		margin-bottom: 2rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
		gap: 1rem;
	}
	section {
		display: grid;
		gap: 0.75rem;
		padding: 1.25rem;
		background: var(--color-card);
		border-radius: 1.25rem;
	}
	h2 {
		font-size: 1.2rem;
		font-weight: 750;
	}
	header p {
		color: var(--color-muted);
		font-size: 0.9rem;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.lockup {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 1rem;
		border-radius: 0.9rem;
		background: var(--color-paper);
		color: var(--color-ink);
	}
	.lockup.light {
		--color-paper: #fbf7e4;
		--color-card: #ffffff;
		--color-ink: #2a2140;
		--color-a: #6a3df5;
		--color-b: #e5620a;
	}
	.lockup.dark {
		--color-paper: #1d1830;
		--color-card: #2a2342;
		--color-ink: #f3eefc;
		--color-a: #8a66ff;
		--color-b: #e66016;
	}
	.stack {
		font-size: 1.35rem;
		line-height: 0.95;
	}
	.line {
		font-size: 1.5rem;
		line-height: 1;
		white-space: nowrap;
	}
	.sample {
		font-size: 1.6rem;
		line-height: 1.1;
		color: var(--color-ink);
	}
</style>
