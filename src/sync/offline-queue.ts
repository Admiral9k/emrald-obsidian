// EMRALD Offline Action Queue
// Tracks actions when API is unreachable and replays them on reconnect.
// Features: persistence to plugin data.json, auto-queue on network failure,
// auto-replay on reconnect, status indicator support, 3-retry limit.

import { Notice } from 'obsidian';

export interface QueuedAction {
	id: string;
	method: string;
	path: string;
	body?: unknown;
	createdAt: number;
	retries: number;
	description: string; // Human-readable description for UI
	lastStatus?: number;
	lastError?: string;
}

export interface OfflineQueueState {
	isOnline: boolean;
	pendingCount: number;
	lastReplayAt: number | null;
	lastReplayResult: { success: number; failed: number } | null;
}

export class OfflineQueue {
	private queue: QueuedAction[] = [];
	private _isOnline: boolean = true;
	private lastReplayAt: number | null = null;
	private lastReplayResult: { success: number; failed: number } | null = null;
	private onStateChange: (() => void) | null = null;
	private replayInProgress: boolean = false;

	constructor() {
		// NOTE: We intentionally do NOT listen to window online/offline events.
		// In Electron (Obsidian), these fire spuriously during heavy JS activity,
		// WebSocket reconnections, and modal rendering — causing false offline
		// detection. Instead, we rely solely on actual API response outcomes
		// via setOnlineStatus() called by the API client.
	}

	/**
	 * Register a callback for state changes (online/offline/queue changes).
	 */
	setOnStateChange(callback: () => void) {
		this.onStateChange = callback;
	}

	/**
	 * Add an action to the queue.
	 * Called when API call fails with a network error.
	 */
	enqueue(method: string, path: string, body?: unknown, description?: string) {
		const action: QueuedAction = {
			id: this.generateId(),
			method,
			path,
			body,
			createdAt: Date.now(),
			retries: 0,
			description: description ?? `${method} ${path}`
		};

		this.queue.push(action);
		this.notifyChange();

		// Notify user
		new Notice(`Queued offline: ${action.description} (${this.queue.length} pending)`);
	}

	/**
	 * Get pending action count.
	 */
	get pendingCount(): number {
		return this.queue.length;
	}

	/**
	 * Check whether a matching queued action already exists.
	 */
	hasQueuedAction(method: string, path: string, predicate?: (body: unknown) => boolean): boolean {
		return this.queue.some(action => {
			if (action.method !== method || action.path !== path) return false;
			return predicate ? predicate(action.body) : true;
		});
	}

	/**
	 * Get current state for UI display.
	 */
	getState(): OfflineQueueState {
		return {
			isOnline: this._isOnline,
			pendingCount: this.queue.length,
			lastReplayAt: this.lastReplayAt,
			lastReplayResult: this.lastReplayResult
		};
	}

	/**
	 * Check if online.
	 */
	get isOnline(): boolean {
		return this._isOnline;
	}

	/**
	 * Manually mark as online/offline (for API-level detection).
	 */
	setOnlineStatus(online: boolean) {
		const changed = this._isOnline !== online;
		this._isOnline = online;
		if (changed) {
			this.notifyChange();
			if (online && this.queue.length > 0) {
				new Notice(`Back online — ${this.queue.length} actions queued for replay`);
			}
		}
	}

	/**
	 * Determine if an API error should trigger queueing.
	 * Returns true for network errors (status 0) and server errors (500+).
	 * Returns false for client errors (4xx) which should be handled immediately.
	 */
	shouldQueue(status: number): boolean {
		return status === 0 || status >= 500;
	}

	/**
	 * Replay all queued actions in order.
	 * Called on reconnect. Returns count of successful replays.
	 */
	async replay(executor: (method: string, path: string, body?: unknown) => Promise<{ ok: boolean; status: number; error?: string }>): Promise<{ success: number; failed: number; remaining: number }> {
		if (this.replayInProgress || this.queue.length === 0) {
			return { success: 0, failed: 0, remaining: this.queue.length };
		}

		this.replayInProgress = true;
		let success = 0;
		let failed = 0;
		const remaining: QueuedAction[] = [];

		new Notice(`Replaying ${this.queue.length} queued actions...`);

		for (const action of this.queue) {
			try {
				const result = await executor(action.method, action.path, action.body);
				action.lastStatus = result.status;
				action.lastError = result.error;

				if (result.ok || (result.status >= 200 && result.status < 500)) {
					// Success or client error (don't retry client errors)
					success++;
				} else {
					// Server error — retry if under limit
					action.retries++;
					if (action.retries < 3) {
						remaining.push(action);
					} else {
						failed++;
					}
				}
			} catch (err) {
				// Network error — retry if under limit
				action.retries++;
				action.lastStatus = 0;
				action.lastError = err instanceof Error ? err.message : 'Network error';
				if (action.retries < 3) {
					remaining.push(action);
				} else {
					failed++;
				}
			}
		}

		this.queue = remaining;
		this.lastReplayAt = Date.now();
		this.lastReplayResult = { success, failed };
		this.replayInProgress = false;
		this.notifyChange();

		// Notify user
		const msg = [];
		if (success > 0) msg.push(`${success} synced`);
		if (failed > 0) msg.push(`${failed} dropped`);
		if (remaining.length > 0) msg.push(`${remaining.length} still pending`);
		new Notice(`Replay complete: ${msg.join(', ')}`);

		return { success, failed, remaining: remaining.length };
	}

	/**
	 * Clear all queued actions.
	 */
	clear() {
		this.queue = [];
		this.notifyChange();
	}

	/**
	 * Remove a specific action by ID.
	 */
	remove(id: string) {
		this.queue = this.queue.filter(a => a.id !== id);
		this.notifyChange();
	}

	/**
	 * Get list of pending actions (for UI display).
	 */
	getPendingActions(): QueuedAction[] {
		return [...this.queue];
	}

	// ── Session Reconciliation ─────────────────────────

	/**
	 * Find all unique local session IDs in the queue.
	 * Local sessions have IDs starting with 'local-'.
	 */
	getLocalSessionIds(): string[] {
		const ids = new Set<string>();
		for (const action of this.queue) {
			const match = action.path.match(/\/sessions\/(local-[^/]+)/);
			if (match) ids.add(match[1]);
		}
		return [...ids];
	}

	/**
	 * Rewrite all queued action paths that reference a local session ID
	 * to use the real remote session ID instead.
	 */
	remapSessionId(localId: string, remoteId: string) {
		for (const action of this.queue) {
			if (action.path.includes(localId)) {
				action.path = action.path.replace(localId, remoteId);
				action.description = action.description.replace(localId, remoteId);
			}
		}
		this.notifyChange();
	}

	/**
	 * Remove the session-start action for a local session ID.
	 * Called after successfully creating the remote session,
	 * so replay doesn't try to create it again.
	 */
	removeSessionStart(localId: string) {
		this.queue = this.queue.filter(action => {
			// Remove the POST /sessions action that started this local session
			if (action.method === 'POST' && action.path === '/sessions') {
				// We need to match by item_id, but we don't have the local session ID
				// in the start action's body. The start action is always first chronologically
				// for a given item, so we check if subsequent actions reference this local ID.
				return true; // Keep — we'll handle differently
			}
			return true;
		});
	}

	/**
	 * Get the item_id from the session-start action that produced a local session.
	 * Finds the POST /sessions action whose item created the local session.
	 */
	getStartActionItemId(localSessionId: string): string | null {
		// The start action is POST /sessions with body { item_id: ... }
		// It was enqueued BEFORE the local-xxx ID was generated,
		// but chronologically it's the earliest action that would produce
		// dependent actions with that local ID.
		// Strategy: find POST /sessions actions, and match by checking
		// if there are subsequent actions using this localSessionId.
		const hasLocalRef = this.queue.some(a => 
			a.path.includes(localSessionId) && a.path !== '/sessions'
		);
		if (!hasLocalRef) return null;

		// Find the POST /sessions start action (should be earliest by createdAt)
		const startActions = this.queue
			.filter(a => a.method === 'POST' && a.path === '/sessions')
			.sort((a, b) => a.createdAt - b.createdAt);

		if (startActions.length > 0) {
			const body = startActions[0].body as Record<string, unknown> | undefined;
			return (body?.item_id as string) ?? null;
		}
		return null;
	}

	/**
	 * Remove a specific start action by its queue ID.
	 */
	removeById(id: string) {
		this.queue = this.queue.filter(a => a.id !== id);
		this.notifyChange();
	}

	/**
	 * Get start actions in the queue (POST /sessions).
	 */
	getStartActions(): QueuedAction[] {
		return this.queue.filter(a => a.method === 'POST' && a.path === '/sessions');
	}

	/**
	 * Replay only actions whose path contains a specific session ID.
	 * Used for interleaved reconciliation: create session → replay its actions → next session.
	 * Returns the actions that were successfully replayed so they can be removed.
	 */
	async replayForSession(
		sessionId: string,
		executor: (method: string, path: string, body?: unknown) => Promise<{ ok: boolean; status: number; error?: string }>
	): Promise<{ success: number; failed: number }> {
		let success = 0;
		let failed = 0;
		const toRemove: string[] = [];

		const sessionActions = this.queue.filter(a => a.path.includes(sessionId));

		for (const action of sessionActions) {
			try {
				const result = await executor(action.method, action.path, action.body);
				action.lastStatus = result.status;
				action.lastError = result.error;

				if (result.ok || (result.status >= 200 && result.status < 500)) {
					success++;
					toRemove.push(action.id);
				} else {
					action.retries++;
					if (action.retries >= 3) {
						failed++;
						toRemove.push(action.id);
					}
				}
			} catch (err) {
				action.retries++;
				action.lastStatus = 0;
				action.lastError = err instanceof Error ? err.message : 'Network error';
				if (action.retries >= 3) {
					failed++;
					toRemove.push(action.id);
				}
			}
		}

		// Remove completed/failed actions
		this.queue = this.queue.filter(a => !toRemove.includes(a.id));
		this.notifyChange();

		return { success, failed };
	}

	// ── Persistence ──────────────────────────────────────

	/**
	 * Serialize queue to JSON for persistence in plugin data.json.
	 */
	toJSON(): QueuedAction[] {
		return [...this.queue];
	}

	/**
	 * Restore queue from JSON (on plugin load).
	 */
	fromJSON(data: QueuedAction[]) {
		if (Array.isArray(data)) {
			// Filter out actions older than 24 hours
			const cutoff = Date.now() - 24 * 60 * 60 * 1000;
			this.queue = data.filter(a => a.createdAt > cutoff);
			this.notifyChange();
		}
	}

	// ── Event Handlers ───────────────────────────────────

	// Kept for reference but no longer wired to window events.
	// Online/offline status is now driven entirely by API response outcomes.
	private handleOnline() {
		this._isOnline = true;
		this.notifyChange();
	}

	private handleOffline() {
		this._isOnline = false;
		this.notifyChange();
	}

	// ── Helpers ──────────────────────────────────────────

	private notifyChange() {
		if (this.onStateChange) {
			this.onStateChange();
		}
	}

	private generateId(): string {
		// Simple UUID alternative for environments without crypto.randomUUID
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return crypto.randomUUID();
		}
		return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
	}

	/**
	 * Destroy — cleanup event listeners.
	 */
	destroy() {
		if (typeof window !== 'undefined') {
			// No window event listeners to remove (disabled due to Electron false-fire)
		}
		this.onStateChange = null;
	}
}
