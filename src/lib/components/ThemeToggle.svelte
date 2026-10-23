<script lang="ts">
	import { theme } from '$lib/theme.svelte';
	import Btn from './Btn.svelte';
	const dark = $derived(theme.current === 'dark');
</script>

<Btn
	size="icon"
	onclick={() => theme.toggle()}
	aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	title={dark ? 'Light mode' : 'Dark mode'}
>
	{#snippet icon()}
		{#if dark}
			<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>
		{:else}
			<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
		{/if}
	{/snippet}
</Btn>
