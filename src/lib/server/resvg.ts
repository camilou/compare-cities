// SVG → PNG on the server with resvg (WebAssembly).
// Production: Wrangler bundles the .wasm import as a compiled module (Workers can't
// compile WebAssembly from bytes at runtime). Dev: read the file from node_modules.
import { dev } from '$app/environment';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

let ready: Promise<void> | undefined;

function init() {
	return (ready ??= (async () => {
		if (dev) {
			// @ts-expect-error Node built-ins are only used by the dev server.
			const { readFile } = await import('node:fs/promises');
			// @ts-expect-error see above
			const { createRequire } = await import('node:module');
			const file = createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm');
			await initWasm(await readFile(file));
		} else {
			// Kept external in vite.config.ts so Wrangler can bundle it as a WebAssembly module.
			const mod = await import('@resvg/resvg-wasm/index_bg.wasm');
			await initWasm(mod.default);
		}
	})());
}

export async function svgToPng(svg: string, fonts: Uint8Array[], width: number): Promise<Uint8Array> {
	await init();
	const r = new Resvg(svg, {
		fitTo: { mode: 'width', value: width },
		font: { fontBuffers: fonts, defaultFontFamily: 'Bricolage Grotesque', loadSystemFonts: false }
	});
	return r.render().asPng();
}
