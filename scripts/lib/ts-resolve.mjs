// Lets scripts import app modules that use extensionless imports (as Vite allows):
//   node --experimental-strip-types --import ./scripts/lib/ts-resolve.mjs scripts/whatever.ts
import { register } from 'node:module';

register(
	'data:text/javascript,' +
		encodeURIComponent(`
export async function resolve(specifier, context, next) {
	try {
		return await next(specifier, context);
	} catch (e) {
		if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\\.{1,2}\\//.test(specifier) || /\\.[cm]?[jt]s$/.test(specifier)) throw e;
		return next(specifier + '.ts', context);
	}
}`),
	import.meta.url
);
