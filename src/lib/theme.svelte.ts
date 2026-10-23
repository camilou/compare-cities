export type ThemeName = 'light' | 'dark';

const store = {
	get: (k: string) => {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set: (k: string, v: string) => {
		try {
			localStorage.setItem(k, v);
		} catch {
			/* private mode: preference just won't persist */
		}
	},
	remove: (k: string) => {
		try {
			localStorage.removeItem(k);
		} catch {
			/* ignore */
		}
	}
};

/** Light/dark theme. The inline script in app.html applies it before first paint. */
class Theme {
	current = $state<ThemeName>('light');

	init() {
		const root = document.documentElement;
		this.current = root.dataset.theme === 'dark' ? 'dark' : 'light';
		matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			if (!store.get('theme')) this.apply(e.matches ? 'dark' : 'light');
		});
	}

	/** Flip the theme. Landing back on the device's own setting forgets the override,
	 *  so the site follows the system again (e.g. automatic dark mode at sunset). */
	toggle() {
		const next = this.current === 'dark' ? 'light' : 'dark';
		const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		if (next === system) store.remove('theme');
		else store.set('theme', next);
		this.apply(next);
	}

	private apply(t: ThemeName) {
		this.current = t;
		document.documentElement.dataset.theme = t;
	}
}

export const theme = new Theme();

/** Read the live city inks from CSS, so the map always matches the page. */
export function inks() {
	const css = getComputedStyle(document.documentElement);
	return { a: css.getPropertyValue('--color-a').trim(), b: css.getPropertyValue('--color-b').trim() };
}
