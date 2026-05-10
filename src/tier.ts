// EMRALD Plugin — Tier state management
// Tracks the user's current tier (free/pro) and provides helpers
// for the UI to conditionally show/hide Pro features.
//
// Usage:
//   import { tierState } from './tier';
//   tierState.refresh(apiClient);           // on load + reconnect
//   if (tierState.isPro()) { ... }          // check before rendering
//   tierState.onTierChange(callback);       // react to tier changes

import type { EmraldAPIClient } from './api/client';

export type Tier = 'free' | 'pro';

class TierState {
	private _tier: Tier = 'free';
	private _hasSubscription: boolean = false;
	private _graceUntil: string | null = null;
	private _lastRefresh: number = 0;
	private _refreshing: boolean = false;
	private _listeners: Array<(tier: Tier) => void> = [];

	/** Current effective tier */
	get tier(): Tier {
		return this._tier;
	}

	/** Whether the user has an active Stripe subscription */
	get hasSubscription(): boolean {
		return this._hasSubscription;
	}

	/** Grace period expiry (if downgraded) */
	get graceUntil(): string | null {
		return this._graceUntil;
	}

	/** Is the user on the Pro tier? */
	isPro(): boolean {
		return this._tier === 'pro';
	}

	/** Is the user on the Free tier? */
	isFree(): boolean {
		return this._tier === 'free';
	}

	/**
	 * Refresh tier status from the API.
	 * Called on plugin load, on reconnect, and periodically (every 5 min).
	 * Skips if already refreshing or if refreshed less than 30s ago.
	 */
	async refresh(client: EmraldAPIClient): Promise<void> {
		const now = Date.now();

		// Debounce: don't re-check more than once per 30 seconds
		if (this._refreshing || (now - this._lastRefresh) < 30_000) {
			return;
		}

		this._refreshing = true;
		try {
			const result = await client.getBillingStatus();
			if (result.data) {
				const oldTier = this._tier;
				this._tier = result.data.tier;
				this._hasSubscription = result.data.has_subscription;
				this._graceUntil = result.data.tier_grace_until;
				this._lastRefresh = now;

				// Notify listeners if tier changed
				if (oldTier !== this._tier) {
					for (const listener of this._listeners) {
						try {
							listener(this._tier);
						} catch (e) {
							console.error('[EMRALD] Tier change listener error:', e);
						}
					}
				}
			}
		} catch (e) {
			// Network error — keep existing tier, don't block plugin functionality
			console.warn('[EMRALD] Failed to refresh tier status:', e);
		} finally {
			this._refreshing = false;
		}
	}

	/**
	 * Register a callback for tier changes.
	 * Returns an unsubscribe function.
	 */
	onTierChange(callback: (tier: Tier) => void): () => void {
		this._listeners.push(callback);
		return () => {
			this._listeners = this._listeners.filter(l => l !== callback);
		};
	}

	/**
	 * Force-set tier (for testing or manual override).
	 */
	_setTier(tier: Tier): void {
		const old = this._tier;
		this._tier = tier;
		if (old !== tier) {
			for (const listener of this._listeners) {
				try { listener(tier); } catch {}
			}
		}
	}

	/**
	 * Reset state (on plugin unload or settings change).
	 */
	reset(): void {
		this._tier = 'free';
		this._hasSubscription = false;
		this._graceUntil = null;
		this._lastRefresh = 0;
		this._refreshing = false;
	}
}

/** Singleton tier state — shared across all plugin components */
export const tierState = new TierState();
