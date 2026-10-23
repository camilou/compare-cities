<script lang="ts">
	import { renderCard } from '$lib/share/render';
	import { headlineText, type CardFormat, type CardInput } from '$lib/share/card';
	import Btn from './Btn.svelte';

	let { input, url }: { input: CardInput; url: string } = $props();

	let dialog: HTMLDialogElement;
	let format = $state<CardFormat>('landscape');
	let blob = $state<Blob>();
	let preview = $state<string>();
	let busy = $state(false);
	let copied = $state(false);
	let failure = $state<string>();

	const text = $derived(headlineText(input));
	const fileName = $derived(`${input.a.name}-vs-${input.b.name}.png`.replace(/[^\p{L}\p{N}.-]+/gu, '-').toLowerCase());
	const canShareFiles = $derived(
		typeof navigator !== 'undefined' &&
			!!navigator.canShare &&
			!!blob &&
			navigator.canShare({ files: [new File([blob], fileName, { type: 'image/png' })] })
	);

	export function open() {
		dialog.showModal();
		draw();
	}

	async function draw() {
		busy = true;
		failure = undefined;
		try {
			const b = await renderCard(input, format);
			if (preview) URL.revokeObjectURL(preview);
			blob = b;
			preview = URL.createObjectURL(b);
		} catch {
			failure = 'The image could not be created in this browser. You can still share the link.';
		} finally {
			busy = false;
		}
	}

	function choose(f: CardFormat) {
		if (f === format) return;
		format = f;
		draw();
	}

	async function shareNative() {
		if (!blob) return;
		try {
			await navigator.share({
				files: [new File([blob], fileName, { type: 'image/png' })],
				title: text,
				text: `${text} ${url}`
			});
		} catch {
			/* cancelled */
		}
	}

	function download() {
		if (!preview) return;
		const a = document.createElement('a');
		a.href = preview;
		a.download = fileName;
		a.click();
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			const t = document.createElement('textarea');
			t.value = url;
			document.body.appendChild(t);
			t.select();
			document.execCommand('copy');
			t.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const e = encodeURIComponent;
	const targets = $derived([
		{ name: 'WhatsApp', href: `https://wa.me/?text=${e(`${text} ${url}`)}` },
		{ name: 'X', href: `https://x.com/intent/post?text=${e(text)}&url=${e(url)}` },
		{ name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
		{ name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}` },
		{ name: 'Reddit', href: `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}` },
		{ name: 'Telegram', href: `https://t.me/share/url?url=${e(url)}&text=${e(text)}` },
		{ name: 'Email', href: `mailto:?subject=${e(text)}&body=${e(`${text}\n\n${url}`)}` }
	]);
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="share-title"
	onclick={(ev) => ev.target === dialog && dialog.close()}
>
	<div class="sheet">
		<header>
			<h2 id="share-title">Share this comparison</h2>
			<Btn size="icon-sm" onclick={() => dialog.close()} aria-label="Close">
				{#snippet icon()}<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>{/snippet}
			</Btn>
		</header>

		<div class="formats" role="radiogroup" aria-label="Image shape">
			<button role="radio" aria-checked={format === 'landscape'} onclick={() => choose('landscape')}>Landscape</button>
			<button role="radio" aria-checked={format === 'portrait'} onclick={() => choose('portrait')}>Portrait</button>
		</div>

		<div class="preview" data-format={format} aria-busy={busy}>
			{#if preview}
				<img src={preview} alt="Share image: {text}" />
			{/if}
			{#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
		</div>
		{#if failure}<p class="failure" role="alert">{failure}</p>{/if}

		<div class="primary">
			{#if canShareFiles}
				<Btn variant="tangerine" onclick={shareNative} disabled={!blob}>
					{#snippet icon()}<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>{/snippet}
					Share image
				</Btn>
			{/if}
			<Btn variant={canShareFiles ? 'paper' : 'tangerine'} onclick={download} disabled={!blob}>
				{#snippet icon()}<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>{/snippet}
				Download image
			</Btn>
			<Btn onclick={copyLink} aria-live="polite">
				{#snippet icon()}<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>{/snippet}
				{copied ? 'Link copied' : 'Copy link'}
			</Btn>
		</div>

		<ul class="targets">
			{#each targets as t (t.name)}
				<li><Btn size="sm" href={t.href} target="_blank" rel="noopener">{t.name}</Btn></li>
			{/each}
		</ul>
	</div>
</dialog>

<style>
	dialog {
		margin: auto;
		padding: 0;
		border: 0;
		border-radius: 1.5rem;
		background: var(--color-card);
		color: var(--color-ink);
		width: min(640px, calc(100% - 2rem));
		max-height: calc(100dvh - 2rem);
		box-shadow: var(--shadow);
	}
	dialog::backdrop {
		background: rgb(20 16 40 / 0.45);
		backdrop-filter: blur(3px);
	}
	dialog[open] {
		animation: rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes rise {
		from {
			transform: translateY(16px);
			opacity: 0;
		}
	}
	.sheet {
		display: grid;
		gap: 1rem;
		padding: 1.25rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		font-size: 1.3rem;
		font-weight: 750;
	}
	.formats {
		display: inline-flex;
		justify-self: start;
		padding: 0.25rem;
		background: var(--color-paper);
		border-radius: 999px;
	}
	.formats button {
		padding: 0.4rem 1rem;
		border-radius: 999px;
		font-weight: 600;
		color: var(--color-muted);
	}
	.formats button[aria-checked='true'] {
		background: var(--color-card);
		color: var(--color-ink);
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.12);
	}
	.preview {
		position: relative;
		display: grid;
		place-items: center;
		background: var(--color-paper);
		border-radius: 1rem;
		overflow: hidden;
		aspect-ratio: 1200 / 630;
	}
	.preview[data-format='portrait'] {
		aspect-ratio: 1080 / 1350;
		max-height: 46dvh;
		justify-self: center;
		width: auto;
		height: 46dvh;
	}
	.preview img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.preview[aria-busy='true'] img {
		opacity: 0.4;
	}
	.spinner {
		position: absolute;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 50%;
		border: 3px solid var(--color-line);
		border-top-color: var(--color-a);
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}
	.failure {
		color: var(--color-error);
		font-size: 0.9rem;
	}
	.primary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.primary > :global(.btn) {
		flex: 1 1 auto;
	}
	.targets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.4rem;
		padding-top: 0.25rem;
	}
	@media (max-width: 640px) {
		dialog {
			width: 100%;
			max-width: none;
			margin: auto 0 0;
			border-radius: 1.5rem 1.5rem 0 0;
			max-height: 92dvh;
		}
		.sheet {
			padding: 1rem 1rem max(1rem, env(safe-area-inset-bottom));
		}
		.preview[data-format='portrait'] {
			height: 40dvh;
		}
	}
</style>
