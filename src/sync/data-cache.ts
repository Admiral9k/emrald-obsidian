// EMRALD Data Cache
// Caches API read responses in memory + plugin data.json so the sidebar
// can display stale data when the API is unreachable.
// Cache keys match API paths. TTL is per-key.

export interface CacheEntry<T = unknown> {
	data: T;
	cachedAt: number;
	ttlMs: number;
}

// Default TTLs per data type
const TTL_1_MIN = 60_000;
const TTL_5_MIN = 300_000;

const DEFAULT_TTLS: Record<string, number> = {
	'/items':              TTL_5_MIN,
	'/sessions':           TTL_1_MIN,
	'/sessions/active':    0,          // Never cache — always fresh
	'/metrics':            TTL_5_MIN,
	'/insights':           TTL_5_MIN,
	'/burnout':            TTL_5_MIN,
	'/availability':       TTL_5_MIN,
	'/notifications':      TTL_5_MIN,
	'/energy':             TTL_5_MIN,  // Today's check-in
};

export class DataCache {
	private cache: Map<string, CacheEntry> = new Map();
	private forceStale: boolean = false;

	/**
	 * When true, ignore TTL expiry — serve stale data.
	 * Used when offline so views don't go blank.
	 */
	setForceStale(force: boolean) {
		this.forceStale = force;
	}

	/**
	 * Get a cached value if it exists and hasn't expired.
	 * When forceStale is true, ignores TTL (serves stale data while offline).
	 */
	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// TTL 0 = never cache (e.g. active session)
		if (entry.ttlMs === 0) return null;

		// If offline (forceStale), serve whatever we have regardless of age
		if (this.forceStale) {
			return entry.data as T;
		}

		const age = Date.now() - entry.cachedAt;
		if (age > entry.ttlMs) {
			this.cache.delete(key);
			return null;
		}

		return entry.data as T;
	}

	/**
	 * Store a value in cache.
	 */
	set<T>(key: string, data: T, ttlMs?: number) {
		const resolvedTtl = ttlMs ?? this.resolveTtl(key);
		if (resolvedTtl === 0) return; // Don't cache

		this.cache.set(key, {
			data,
			cachedAt: Date.now(),
			ttlMs: resolvedTtl
		});
	}

	/**
	 * Invalidate a specific cache key.
	 */
	invalidate(key: string) {
		this.cache.delete(key);
	}

	/**
	 * Invalidate all keys matching a prefix (e.g., '/sessions' clears all session caches).
	 */
	invalidatePrefix(prefix: string) {
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Clear entire cache.
	 */
	clear() {
		this.cache.clear();
	}

	/**
	 * Serialize cache for persistence.
	 * Only persists entries with TTL > 1 min (skip very transient data).
	 */
	toJSON(): Record<string, CacheEntry> {
		const result: Record<string, CacheEntry> = {};
		for (const [key, entry] of this.cache) {
			if (entry.ttlMs > TTL_1_MIN) {
				result[key] = entry;
			}
		}
		return result;
	}

	/**
	 * Restore cache from persisted data.
	 * Drops expired entries on load.
	 */
	fromJSON(data: Record<string, CacheEntry>) {
		if (!data || typeof data !== 'object') return;

		const now = Date.now();
		for (const [key, entry] of Object.entries(data)) {
			if (entry && entry.cachedAt && entry.data) {
				const age = now - entry.cachedAt;
				// Only restore if less than 1 hour old (stale-while-revalidate)
				if (age < 3_600_000) {
					this.cache.set(key, entry);
				}
			}
		}
	}

	/**
	 * Get the number of cached entries.
	 */
	get size(): number {
		return this.cache.size;
	}

	private resolveTtl(key: string): number {
		// Try exact match first
		if (DEFAULT_TTLS[key] !== undefined) return DEFAULT_TTLS[key];

		// Try prefix match (e.g., '/metrics/D1/history' matches '/metrics')
		for (const [prefix, ttl] of Object.entries(DEFAULT_TTLS)) {
			if (key.startsWith(prefix)) return ttl;
		}

		// Default: 5 minutes
		return TTL_5_MIN;
	}
}
