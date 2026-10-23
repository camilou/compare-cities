// Browser side: turn the share-card SVG into a PNG (fonts embedded so the image
// looks identical to the server-rendered link preview).
import { buildCardSvg, CARD_SIZE, FONT, type CardFormat, type CardInput } from './card';

let fontCss: Promise<string> | undefined;

async function dataUrl(path: string) {
	const blob = await (await fetch(path)).blob();
	return new Promise<string>((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = reject;
		r.readAsDataURL(blob);
	});
}

function fonts() {
	return (fontCss ??= Promise.all([dataUrl('/fonts/bricolage-500.ttf'), dataUrl('/fonts/bricolage-800.ttf')]).then(
		([regular, bold]) =>
			`@font-face{font-family:'${FONT}';font-weight:500;src:url(${regular}) format('truetype')}` +
			`@font-face{font-family:'${FONT}';font-weight:800;src:url(${bold}) format('truetype')}`
	));
}

export async function renderCard(input: CardInput, format: CardFormat): Promise<Blob> {
	const svg = buildCardSvg(input, format, await fonts());
	const [w, h] = CARD_SIZE[format];
	const img = new Image();
	img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	try {
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png')
		);
	} finally {
		URL.revokeObjectURL(img.src);
	}
}
