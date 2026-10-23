declare global {
	namespace App {
		interface Platform {
			env: Record<string, unknown>;
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
			cf?: IncomingRequestCfProperties;
		}
	}
}

export {};
