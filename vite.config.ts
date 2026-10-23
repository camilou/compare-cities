import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// MapLibre's worker is bundled separately and handed to it via setWorkerUrl.
	worker: { format: 'es' },
	build: {
		// resvg's .wasm stays an import for Wrangler to bundle as a WebAssembly module.
		rollupOptions: { external: [/\.wasm$/] }
	}
});
