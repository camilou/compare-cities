<!-- Temporary: compare logo concepts. Delete this route once one is picked. -->
<script lang="ts">
	import Logo, { LOGO_VARIANTS } from '$lib/components/Logo.svelte';
</script>

<svelte:head><title>Logo options · Compare cities</title></svelte:head>

<main>
	<h1>Logo options</h1>
	<p class="lede">Each concept shown big, in the header on light and dark, and at favicon sizes.</p>

	<div class="grid">
		{#each LOGO_VARIANTS as v, i (v.id)}
			<section>
				<header>
					<h2>{i + 1}. {v.name}</h2>
					<p>{v.note}</p>
				</header>
				<div class="hero"><Logo variant={v.id} size={112} /></div>
				<div class="lockups">
					<div class="lockup light" data-theme="light">
						<Logo variant={v.id} size={38} />
						<span class="wordmark">compare<br />cities</span>
					</div>
					<div class="lockup dark" data-theme="dark">
						<Logo variant={v.id} size={38} />
						<span class="wordmark">compare<br />cities</span>
					</div>
				</div>
				<div class="tabs">
					<span class="tab"><Logo variant={v.id} size={16} /> Compare cities</span>
					<Logo variant={v.id} size={32} />
					<Logo variant={v.id} size={20} />
				</div>
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
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr));
		gap: 1rem;
	}
	section {
		display: grid;
		gap: 1rem;
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
	.hero {
		display: grid;
		place-items: center;
		height: 180px;
		border-radius: 1rem;
		background: var(--color-paper);
	}
	.lockups {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.lockup {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.9rem;
		border-radius: 0.9rem;
		background: var(--color-paper);
		color: var(--color-ink);
	}
	/* Local dark tokens so both versions sit side by side. */
	.lockup.dark {
		--color-paper: #1d1830;
		--color-card: #2a2342;
		--color-ink: #f3eefc;
		--color-a: #8a66ff;
		--color-b: #e66016;
	}
	.lockup.light {
		--color-paper: #fbf7e4;
		--color-card: #ffffff;
		--color-ink: #2a2140;
		--color-a: #6a3df5;
		--color-b: #e5620a;
	}
	.wordmark {
		font-size: 1.05rem;
		line-height: 0.95;
		font-weight: 800;
		font-stretch: 78%;
	}
	.tabs {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.8rem;
		border-radius: 0.6rem 0.6rem 0 0;
		background: var(--color-paper);
		font-size: 0.8rem;
	}
</style>
