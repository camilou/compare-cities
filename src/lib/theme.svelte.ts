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

	toggle() {
		const next = this.current === 'dark' ? 'light' : 'dark';
		store.set('theme', next);
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
