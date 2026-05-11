// EMRALD API Client — Thin wrapper for all EMRALD API calls
// All computation is server-side. This client fetches and sends data only.
// Uses Obsidian's requestUrl for CORS-safe requests.

import { Notice, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import type { OfflineQueue } from '../sync/offline-queue';
import type { DataCache } from '../sync/data-cache';

export interface APIResponse<T> {
	data: T | null;
	error: string | null;
	status: number;
	fromCache?: boolean;
	queued?: boolean;
}

export class EmraldAPIClient {
	private apiKey: string;
	private baseUrl: string;
	private offlineQueue: OfflineQueue | null = null;
	private dataCache: DataCache | null = null;
	private reconcileInProgress: boolean = false;
	private reconcileResolvers: Array<() => void> = [];

	constructor(apiKey: string, baseUrl: string) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl.replace(/\/$/, ''); // strip trailing slash
	}

	updateCredentials(apiKey: string, baseUrl: string) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl.replace(/\/$/, '');
	}

	isConfigured(): boolean {
		return this.apiKey.length > 0 && this.baseUrl.length > 0;
	}

	/**
	 * Wire in an offline queue for automatic action queueing on network failures.
	 */
	setOfflineQueue(queue: OfflineQueue) {
		this.offlineQueue = queue;
	}

	/**
	 * Wire in a data cache for offline read fallback.
	 */
	setDataCache(cache: DataCache) {
		this.dataCache = cache;
	}

	/**
	 * Returns a promise that resolves when any in-progress reconciliation
	 * completes. Resolves immediately if no reconciliation is running.
	 * Used by the sidebar to wait before refreshing after reconnect (P17 fix).
	 */
	waitForReconciliation(): Promise<void> {
		if (!this.reconcileInProgress) return Promise.resolve();
		return new Promise(resolve => {
			this.reconcileResolvers.push(resolve);
		});
	}

	private async request<T>(method: string, path: string, body?: unknown, opts?: { skipCache?: boolean }): Promise<APIResponse<T>> {
		if (!this.isConfigured()) {
			return { data: null, error: 'API key not configured', status: 0 };
		}

		const result = await this.requestWithRetry<T>(method, path, body, 0);

		// On successful GET, cache the response
		if (method === 'GET' && result.data !== null && this.dataCache && !opts?.skipCache) {
			this.dataCache.set(path, result.data);
		}

		// On write success, invalidate related caches.
		// Skip invalidation for queued (offline) writes — the write hasn't
		// actually reached the server yet, so cached reads are still valid.
		if (method !== 'GET' && !result.error && !result.queued && this.dataCache) {
			// Invalidate the collection path (e.g., POST /sessions invalidates /sessions*)
			const basePath = '/' + path.split('/').filter(Boolean)[0];
			this.dataCache.invalidatePrefix(basePath);
		}

		// On GET failure, try cache fallback (unless skipCache)
		if (method === 'GET' && result.data === null && result.status !== 404 && this.dataCache && !opts?.skipCache) {
			const cached = this.dataCache.get<T>(path);
			if (cached !== null) {
				return { data: cached, error: null, status: 200, fromCache: true };
			}
		}

		return result;
	}

	private async requestWithRetry<T>(method: string, path: string, body: unknown, attempt: number): Promise<APIResponse<T>> {
		// Fast-path: if we already know we're offline, skip the network attempt for writes
		if (this.offlineQueue && !this.offlineQueue.isOnline && method !== 'GET') {
			this.offlineQueue.enqueue(method, path, body, `${method} ${path}`);
			return { data: null, error: null, status: 0, queued: true };
		}

		try {
			const params: RequestUrlParam = {
				url: `${this.baseUrl}${path}`,
				method: method,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `ApiKey ${this.apiKey}`
				}
			};

			if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
				params.body = JSON.stringify(body);
			}

			// Use a short timeout on the first write attempt so offline detection
			// is fast (P12 fix). GETs keep 15s; writes start at 3s on attempt 0,
			// then escalate to 10s on retries.
			const timeoutMs = method === 'GET' ? 15000 : (attempt === 0 ? 3000 : 10000);
			const response: RequestUrlResponse = await Promise.race([
				requestUrl(params),
				new Promise<never>((_, reject) =>
					activeWindow.setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
				)
			]);

			// ── Success ─────────────────────────────────
			if (response.status < 400) {
				if (this.offlineQueue) {
					this.offlineQueue.setOnlineStatus(true);
					if (this.offlineQueue.pendingCount > 0 && !this.reconcileInProgress) {
						void this.reconcileAndReplay();
					}
				}

				if (response.status === 204) {
					return { data: null, error: null, status: 204 };
				}

				// Unwrap API envelope: many endpoints return { data: <payload>, total?, limit?, offset? }
				// Extract the inner .data so callers get the actual payload directly.
				let payload: unknown = response.json;
				if (payload && typeof payload === 'object' && 'data' in payload && !Array.isArray(payload)) {
					payload = (payload as Record<string, unknown>).data;
				}
				return { data: payload as T, error: null, status: response.status };
			}

			// ── Client Errors (4xx) ─────────────────────

			// 401 Unauthorized — credentials expired or invalid
			if (response.status === 401) {
				return {
					data: null,
					error: 'Session expired — please re-enter your API key in Settings.',
					status: 401
				};
			}

			// 403 Forbidden — free tier limit hit
			if (response.status === 403) {
				const msg = this.extractErrorMessage(response) || 'Feature requires EMRALD Pro';
				return {
					data: null,
					error: `Free tier limit: ${msg}. Upgrade at effortmastery.com/pro`,
					status: 403
				};
			}

			// 404 Not Found — silent for metrics not yet computed
			if (response.status === 404) {
				return { data: null, error: null, status: 404 };
			}

			// 409 Conflict — already exists (e.g., duplicate check-in)
			if (response.status === 409) {
				return { data: null, error: 'Already submitted', status: 409 };
			}

			// 429 Rate Limited — exponential backoff with Retry-After
			if (response.status === 429) {
				const retryAfter = parseInt(response.headers?.['retry-after'] ?? '0');
				const delayMs = retryAfter > 0
					? retryAfter * 1000
					: Math.min(1000 * Math.pow(2, attempt), 16000); // 1s, 2s, 4s, 8s, 16s

				if (attempt < 4) {
					await this.delay(delayMs);
					return this.requestWithRetry<T>(method, path, body, attempt + 1);
				}

				return {
					data: null,
					error: 'Rate limited — please wait a moment and try again.',
					status: 429
				};
			}

			// ── Server Errors (5xx) — retry up to 3 times ──

			if (response.status >= 500) {
				if (attempt < 3) {
					const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
					await this.delay(delayMs);
					return this.requestWithRetry<T>(method, path, body, attempt + 1);
				}

				return {
					data: null,
					error: 'EMRALD is having trouble. Please try again in a moment.',
					status: response.status
				};
			}

			// ── Other errors ────────────────────────────
			const errorText = this.extractErrorMessage(response) || `HTTP ${response.status}`;
			return { data: null, error: errorText, status: response.status };

		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			const errAny = err as Record<string, unknown>;

			// Obsidian's requestUrl throws on 4xx/5xx instead of returning a response.
			// Try to extract the HTTP status from the error to distinguish HTTP errors
			// from true network failures. Only queue offline on genuine network loss.
			const statusMatch = message.match(/status\s*(\d{3})/i);
			const thrownStatus = statusMatch ? parseInt(statusMatch[1]) : 0;

			// Best-effort extraction of extra debug details from the thrown object.
			const debugParts: string[] = [];
			if (errAny?.response) debugParts.push(`response=${JSON.stringify(errAny.response)}`);
			if (errAny?.body) debugParts.push(`body=${typeof errAny.body === 'string' ? errAny.body : JSON.stringify(errAny.body)}`);
			if (errAny?.headers) debugParts.push(`headers=${JSON.stringify(errAny.headers)}`);
			if (errAny?.stack && this.dataCache) {
				// stack often exists; no need to surface to user, but useful in console
			}

			if (thrownStatus >= 400) {
				// Server responded — we ARE online
				if (this.offlineQueue) {
					this.offlineQueue.setOnlineStatus(true);
				}
				console.error(`[EMRALD API] ${method} ${path} failed`, {
					status: thrownStatus,
					message,
					body,
					error: errAny
				});

				// Return clean user-facing messages for known status codes
				// instead of dumping raw headers/debug info
				if (thrownStatus === 401) {
					return { data: null, error: 'Invalid API key — please check your key in Settings.', status: 401 };
				}
				if (thrownStatus === 403) {
					return { data: null, error: 'Feature requires EMRALD Pro. Upgrade at effortmastery.com/pro', status: 403 };
				}
				if (thrownStatus === 404) {
					return { data: null, error: null, status: 404 };
				}
				if (thrownStatus === 429) {
					return { data: null, error: 'Rate limited — please wait a moment and try again.', status: 429 };
				}

				// For other errors, show a clean message (debug details in console only)
				return { data: null, error: `Request failed (${thrownStatus}). Check console for details.`, status: thrownStatus };
			}

			const isTimeout = message.toLowerCase().includes('timeout');

			// True network failure OR timeout on writes — auto-enqueue and mark offline.
			// Timeouts on writes are treated as offline because the server is unreachable
			// either way, and the user shouldn't wait for multiple retry cycles (P12 fix).
			if (this.offlineQueue && method !== 'GET' && (this.offlineQueue.shouldQueue(0) || isTimeout)) {
				this.offlineQueue.enqueue(method, path, body, `${method} ${path}`);
				this.offlineQueue.setOnlineStatus(false);
				return { data: null, error: null, status: 0, queued: true };
			}

			console.error(`[EMRALD API] ${method} ${path} network failure`, {
				message,
				body,
				error: errAny
			});
			return { data: null, error: message, status: 0 };
		}
	}

	/**
	 * Reconcile local provisional sessions and replay queue.
	 * 
	 * SEQUENTIAL approach: for each local session:
	 *   1. Find matching start action → create real remote session
	 *   2. Remap local-xxx → real ID in all queued paths
	 *   3. Remove the start action
	 *   4. Replay all non-start actions until we hit the next POST /sessions
	 *      (which is the start of the next offline session)
	 *   5. Move to next session
	 * 
	 * This ensures each session completes (stop, receipt) before the next starts.
	 * After all sessions reconciled, replay any remaining non-session actions.
	 */
	private async reconcileAndReplay(): Promise<void> {
		if (!this.offlineQueue || this.reconcileInProgress) return;
		this.reconcileInProgress = true;

		try {
		const localIds = this.offlineQueue.getLocalSessionIds();

		if (localIds.length > 0) {
			new Notice(`Reconciling ${localIds.length} offline session(s)...`);

			for (const localId of localIds) {
				const startActions = this.offlineQueue.getStartActions();
				const startAction = startActions[0];

				if (!startAction) {
					const orphaned = this.offlineQueue.getPendingActions()
						.filter(a => a.path.includes(localId));
					for (const a of orphaned) {
						this.offlineQueue.remove(a.id);
					}
					new Notice(`Dropped orphaned offline session (no start action found)`);
					continue;
				}

				const body = startAction.body as Record<string, unknown> | undefined;
				const itemId = body?.item_id as string | undefined;

				if (!itemId) {
					this.offlineQueue.removeById(startAction.id);
					continue;
				}

				// Step 1: Create real remote session
				try {
					const result = await this.executeQueuedRequest('POST', '/sessions', { item_id: itemId });

					if (result.ok && result.responseData) {
						let sessionData: unknown = result.responseData;
						if (sessionData && typeof sessionData === 'object' && 'data' in sessionData) {
							sessionData = (sessionData as Record<string, unknown>).data;
						}

						const remoteId = (sessionData as Record<string, unknown>)?.id as string;

						if (remoteId) {
							// Step 2: Remove start action + remap IDs
							this.offlineQueue.removeById(startAction.id);
							this.offlineQueue.remapSessionId(localId, remoteId);

							new Notice(`Session reconciled: ${localId.slice(0, 12)}... → ${remoteId.slice(0, 8)}...`);

							// Step 3: Replay actions sequentially until we hit the next session start
							await this.replayUntilNextStart();
						} else {
							this.offlineQueue.removeById(startAction.id);
							new Notice('Session created but could not extract id — dependent actions dropped');
							const deps = this.offlineQueue.getPendingActions()
								.filter(a => a.path.includes(localId));
							for (const d of deps) this.offlineQueue.remove(d.id);
						}
					} else {
						const errMsg = result.error || `HTTP ${result.status}`;
						new Notice(`Failed to reconcile offline session: ${errMsg}`);

						if (result.status >= 400 && result.status < 500) {
							this.offlineQueue.removeById(startAction.id);
							const deps = this.offlineQueue.getPendingActions()
								.filter(a => a.path.includes(localId));
							for (const d of deps) this.offlineQueue.remove(d.id);
						}
					}
				} catch { /* non-fatal */
					new Notice('Network error during session reconciliation — will retry later');
				}
			}
		}

		// Replay remaining non-session actions (energy check-ins, item status changes, recovery CRUD, etc.)
		if (this.offlineQueue.pendingCount > 0) {
			await this.offlineQueue.replay((m, p, b) => this.executeQueuedRequest(m, p, b));
		}

		// P14 fix: After replay, invalidate all cached data so the sidebar
		// refresh fetches fresh server state (item statuses, sessions, etc.).
		// Without this, loadProjects() would serve stale cached items because
		// executeQueuedRequest bypasses the normal request() cache invalidation.
		if (this.dataCache) {
			this.dataCache.clear();
		}

		} finally {
			this.reconcileInProgress = false;
			// Notify anyone waiting for reconciliation to finish (P17 fix)
			for (const resolve of this.reconcileResolvers) resolve();
			this.reconcileResolvers = [];
		}
	}

	/**
	 * Replay queued actions in order, stopping when we hit a POST /sessions
	 * (the start of the next offline session). This ensures each session
	 * completes (stop, receipt, etc.) before the next one begins.
	 */
	private async replayUntilNextStart(): Promise<void> {
		if (!this.offlineQueue) return;

		let synced = 0;
		let failed = 0;

		while (this.offlineQueue.pendingCount > 0) {
			const actions = this.offlineQueue.getPendingActions();
			const next = actions[0];
			if (!next) break;

			// Stop if we hit the next session start
			if (next.method === 'POST' && next.path === '/sessions') {
				break;
			}

			// Execute this action
			try {
				const result = await this.executeQueuedRequest(next.method, next.path, next.body);
				next.lastStatus = result.status;
				next.lastError = result.error;

				if (result.ok) {
					synced++;
					this.offlineQueue.remove(next.id);
				} else if (result.status >= 400 && result.status < 500) {
					// Client error — won't improve with retries, remove it
					failed++;
					this.offlineQueue.remove(next.id);
				} else {
					// Server error — leave for later
					break;
				}
			} catch { /* non-fatal */
				// Network error during replay — stop and retry later
				break;
			}
		}

		if (synced > 0 || failed > 0) {
			const parts = [];
			if (synced > 0) parts.push(`${synced} synced`);
			if (failed > 0) parts.push(`${failed} failed`);
			new Notice(`Session actions: ${parts.join(', ')}`);
		}
	}

	private async executeQueuedRequest(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; error?: string; responseData?: unknown }> {
		try {
			const params: RequestUrlParam = {
				url: `${this.baseUrl}${path}`,
				method,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `ApiKey ${this.apiKey}`
				}
			};

			if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
				params.body = JSON.stringify(body);
			}

			const response = await requestUrl(params);
			return {
				ok: response.status >= 200 && response.status < 300,
				status: response.status,
				error: response.status >= 400 ? this.extractErrorMessage(response) || `HTTP ${response.status}` : undefined,
				responseData: response.status >= 200 && response.status < 300 ? response.json : undefined
			};
		} catch (err) {
			// Obsidian's requestUrl throws on 4xx/5xx — try to extract status
			const message = err instanceof Error ? err.message : 'Network error';
			const statusMatch = message.match(/status\s+(\d+)/);
			const status = statusMatch ? parseInt(statusMatch[1]) : 0;
			return { ok: false, status, error: message };
		}
	}

	private extractErrorMessage(response: RequestUrlResponse): string {
		try {
			if (typeof response.json === 'object' && response.json !== null) {
				const json = response.json as Record<string, unknown>;
				return (json.message ?? json.error ?? JSON.stringify(json)) as string;
			}
			return response.text || '';
		} catch { /* non-fatal */
			return '';
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => activeWindow.setTimeout(resolve, ms));
	}

	// ── Auth ──────────────────────────────────────────────

	async testConnection(): Promise<APIResponse<{ user_id: string }>> {
		return this.request('GET', '/auth/me', undefined, { skipCache: true });
	}

	// ── Tracked Items (Projects) ─────────────────────────

	async getItems(): Promise<APIResponse<TrackedItem[]>> {
		return this.request('GET', '/items');
	}

	async createItem(item: CreateItemPayload): Promise<APIResponse<TrackedItem>> {
		return this.request('POST', '/items', item);
	}

	async updateItem(id: string, updates: Partial<TrackedItem>): Promise<APIResponse<TrackedItem>> {
		return this.request('PATCH', `/items/${id}`, updates);
	}

	// ── Sessions ─────────────────────────────────────────

	async startSession(itemId: string): Promise<APIResponse<Session>> {
		return this.request('POST', '/sessions', { item_id: itemId });
	}

	async stopSession(sessionId: string, opts?: { was_recovered?: boolean; recovered_actual_minutes?: number }): Promise<APIResponse<Session>> {
		return this.request('POST', `/sessions/${sessionId}/stop`, opts ?? {});
	}

	async pauseSession(sessionId: string, reason?: string): Promise<APIResponse<Session>> {
		return this.request('POST', `/sessions/${sessionId}/pause`, { reason: reason || 'manual' });
	}

	async resumeSession(sessionId: string): Promise<APIResponse<Session>> {
		return this.request('POST', `/sessions/${sessionId}/resume`);
	}

	async discardSession(sessionId: string): Promise<APIResponse<void>> {
		return this.request('POST', `/sessions/${sessionId}/discard`);
	}

	async getActiveSession(): Promise<APIResponse<Session | null>> {
		return this.request('GET', '/sessions/active');
	}

	async getTodaySessions(): Promise<APIResponse<Session[]>> {
		const today = new Date().toISOString().split('T')[0];
		return this.request('GET', `/sessions?from=${today}&limit=100`);
	}

	async listSessions(opts: { from?: string; to?: string; limit?: number }): Promise<APIResponse<Session[]>> {
		const params = new URLSearchParams();
		if (opts.from) params.set('from', opts.from);
		if (opts.to) params.set('to', opts.to);
		if (opts.limit) params.set('limit', String(opts.limit));
		return this.request('GET', `/sessions?${params.toString()}`);
	}

	async getItemSessionStats(itemId: string): Promise<APIResponse<Session[]>> {
		return this.request('GET', `/sessions?item_id=${itemId}&limit=1000`);
	}

	// ── Effort Receipts ──────────────────────────────────

	async submitReceipt(sessionId: string, receipt: CreateReceiptPayload): Promise<APIResponse<EffortReceipt>> {
		return this.request('POST', `/sessions/${sessionId}/receipt`, receipt);
	}

	// ── Energy Check-ins ─────────────────────────────────

	async submitEnergyCheckin(checkin: CreateEnergyCheckinPayload): Promise<APIResponse<EnergyCheckin>> {
		return this.request('POST', '/energy-checkins', checkin);
	}

	async getTodayCheckin(): Promise<APIResponse<EnergyCheckin | null>> {
		return this.request('GET', '/energy-checkins/today');
	}

	// ── Metrics ──────────────────────────────────────────

	async getMetrics(keys?: string[], opts?: { skipCache?: boolean }): Promise<APIResponse<ComputedMetric[]>> {
		const query = keys ? `?keys=${keys.join(',')}` : '';
		return this.request('GET', `/metrics${query}`, undefined, opts);
	}

	async getMetricHistory(key: string, from?: string, to?: string, limit?: number, opts?: { skipCache?: boolean }): Promise<APIResponse<ComputedMetricHistory[]>> {
		const params = new URLSearchParams();
		if (from) params.set('from', from);
		if (to) params.set('to', to);
		params.set('limit', String(limit ?? 5000));
		const query = `?${params.toString()}`;
		return this.request('GET', `/metrics/${key}/history${query}`, undefined, opts);
	}

	async triggerMetricCompute(): Promise<APIResponse<void>> {
		return this.request('POST', '/metrics/compute');
	}

	// ── Preferences ────────────────────────────────

	async getPreferences(): Promise<APIResponse<Record<string, unknown>>> {
		return this.request('GET', '/preferences');
	}

	async updatePreferences(updates: Record<string, unknown>): Promise<APIResponse<Record<string, unknown>>> {
		return this.request('PATCH', '/preferences', updates);
	}

	// ── Insights ────────────────────────────────────────────────

	async getInsights(limit?: number): Promise<APIResponse<AIInsight[]>> {
		const query = limit ? `?limit=${limit}` : '';
		return this.request('GET', `/insights${query}`);
	}

	async getUnreadInsights(): Promise<APIResponse<{ count: number; latest: AIInsight[] }>> {
		return this.request('GET', '/insights/unread');
	}

	async acknowledgeInsight(id: string, action: 'dismissed' | 'acted'): Promise<APIResponse<void>> {
		return this.request('PATCH', `/insights/${id}`, {
			action_taken: action
		});
	}

	// ── Burnout ──────────────────────────────────────────

	async getBurnoutState(): Promise<APIResponse<BurnoutState>> {
		return this.request('GET', '/burnout');
	}

	async getBurnoutHistory(): Promise<APIResponse<BurnoutEpisode[]>> {
		return this.request('GET', '/burnout/history');
	}

	// ── Recovery ─────────────────────────────────────────

	async getRecoveryProtocols(opts?: { skipCache?: boolean }): Promise<APIResponse<RecoveryProtocol[]>> {
		return this.request('GET', '/recovery-protocols', undefined, opts);
	}

	async createRecoveryProtocol(name: string, description?: string): Promise<APIResponse<RecoveryProtocol>> {
		return this.request('POST', '/recovery-protocols', { name, description: description || null });
	}

	async updateRecoveryProtocol(id: string, updates: { name?: string; description?: string; is_active?: boolean }): Promise<APIResponse<RecoveryProtocol>> {
		return this.request('PATCH', `/recovery-protocols/${id}`, updates);
	}

	async deleteRecoveryProtocol(id: string): Promise<APIResponse<unknown>> {
		return this.request('DELETE', `/recovery-protocols/${id}`);
	}

	async getRecoveryLogs(): Promise<APIResponse<RecoveryLog[]>> {
		return this.request('GET', '/recovery-logs');
	}

	async logRecovery(entry: CreateRecoveryPayload): Promise<APIResponse<RecoveryLog>> {
		return this.request('POST', '/recovery-logs', entry);
	}

	// ── Digests ──────────────────────────────────────────

	async getDigests(period?: string): Promise<APIResponse<Digest[]>> {
		const query = period ? `?period=${period}` : '';
		return this.request('GET', `/digests${query}`);
	}

	// ── Profile ──────────────────────────────────────────

	// ── Profile / Calibration ───────────────────────────

	async getProfile(opts?: { skipCache?: boolean }): Promise<APIResponse<UserProfile>> {
		return this.request('GET', '/profile', undefined, opts);
	}

	async getProfileHistory(opts?: { skipCache?: boolean }): Promise<APIResponse<ProfileHistoryEntry[]>> {
		return this.request('GET', '/profile/history', undefined, opts);
	}

	async triggerReassessment(): Promise<APIResponse<void>> {
		return this.request('POST', '/profile/reassessment', { reason: 'manual' });
	}

	async updateCalibration(answers: Record<string, unknown>): Promise<APIResponse<Record<string, unknown>>> {
		return this.request('PATCH', '/profile/questions', answers);
	}

	async updateProfile(updates: Record<string, unknown>): Promise<APIResponse<Record<string, unknown>>> {
		return this.request('PATCH', '/profile', updates);
	}

	// ── Suggestions ─────────────────────────────────────

	async getSuggestions(): Promise<APIResponse<Suggestion[]>> {
		return this.request('GET', '/suggestions');
	}

	// ── Availability ────────────────────────────────────

	async getAvailability(): Promise<APIResponse<Availability>> {
		return this.request('GET', '/availability');
	}

	async setDailyAvailability(schedule: Array<{day: number; available_hours: number}>): Promise<APIResponse<void>> {
		return this.request('PUT', '/availability', { schedule });
	}

	async setWeeklyAvailability(hours: number): Promise<APIResponse<void>> {
		// Set the same hours for all 7 days of the week
		const schedule = Array.from({ length: 7 }, (_, day) => ({
			day,
			available_hours: hours
		}));
		return this.request('PUT', '/availability', { schedule });
	}

	async setAvailabilityOverride(date: string, hours: number): Promise<APIResponse<void>> {
		// The API only has PUT /availability with a full 7-day schedule.
		// For a single-day override, fetch current schedule, update the target day, then PUT.
		// API returns flat array: [{day_of_week, available_hours}, ...]
		const currentResp = await this.getAvailability();
		const currentRows = currentResp.data as unknown as Array<{day_of_week: number; available_hours: number}> | null;

		const dayOfWeek = new Date(date + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
		const schedule: Array<{ day: number; available_hours: number }> = [];
		for (let d = 0; d < 7; d++) {
			const existing = Array.isArray(currentRows)
				? currentRows.find((e) => e.day_of_week === d)
				: null;
			schedule.push({
				day: d,
				available_hours: d === dayOfWeek ? hours : (existing?.available_hours ?? hours)
			});
		}

		// Optimistically update the data cache so subsequent reads (e.g., on
		// reconnect sidebar refresh) return the overridden value even if the
		// PUT is still queued offline (P13 fix).
		if (this.dataCache) {
			const cachedAvail = schedule.map(s => ({
				day_of_week: s.day,
				available_hours: s.available_hours
			}));
			this.dataCache.set('/availability', cachedAvail);
		}

		return this.request('PUT', '/availability', { schedule });
	}

	// ── Billing / Tier ───────────────────────────────────

	async getBillingStatus(): Promise<APIResponse<{ tier: 'free' | 'pro'; has_subscription: boolean; tier_grace_until: string | null }>> {
		return this.request('GET', '/billing/status', undefined, { skipCache: true });
	}

	// ── Notifications ───────────────────────────────────

	async getPendingNotifications(): Promise<APIResponse<EmraldNotification[]>> {
		return this.request('GET', '/notifications?status=pending');
	}
}

// ── Type Definitions ────────────────────────────────────────

export interface TrackedItem {
	id: string;
	user_id: string;
	name: string;
	status: 'active' | 'paused' | 'completed' | 'abandoned';
	effort_level: 'E1' | 'E2' | 'E3' | 'E4';
	area_id: string | null;
	obsidian_note_path: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateItemPayload {
	name: string;
	effort_level: 'E1' | 'E2' | 'E3' | 'E4';
	status?: 'active' | 'paused' | 'completed' | 'abandoned';
	area_id?: string;
	obsidian_note_path?: string;
}

export interface Session {
	id: string;
	user_id: string;
	item_id: string;
	status: 'active' | 'paused' | 'completed' | 'discarded';
	started_at: string;
	stopped_at: string | null;
	duration_minutes: number | null;
	pause_duration_minutes: number | null;
	pause_reason: string | null;
	was_recovered: boolean;
	recovered_actual_minutes: number | null;
}

export interface EffortReceipt {
	id: string;
	session_id: string;
	perceived_effort: number;
	hedonic_valence: number;
	flow_occurred: number; // 0=no, 1=somewhat, 2=yes
	demand_investment_balance: number;
	effort_source: string[];
	notes: string | null;
	created_at: string;
}

export interface CreateReceiptPayload {
	perceived_effort: number;      // 1-10
	hedonic_valence: number;       // 1-10
	flow_occurred: number;         // 0, 1, or 2
	demand_investment_balance: number; // 1-10
	effort_source: string[];       // e.g. ['complexity', 'emotional']
	notes?: string;
}

export interface EnergyCheckin {
	id: string;
	user_id: string;
	checkin_date: string;
	sleep_quality: number;
	sleep_hours: number | null;
	physical_energy: number;
	emotional_state: number;
	mental_clarity: number;
	created_at: string;
}

export interface CreateEnergyCheckinPayload {
	sleep_quality: number;        // 1-10
	sleep_hours?: number;
	physical_energy: number;      // 1-10
	emotional_state: number;      // 1-10
	mental_clarity: number;       // 1-10
	notes?: string;
	recovery_yesterday?: boolean;      // Did you recharge yesterday?
	recovery_effectiveness?: number;   // 1-3 (Low/Moderate/High)
}

export interface ComputedMetric {
	metric_key: string;
	value: number | null;
	metadata: Record<string, unknown>;
	computed_at: string;
}

export interface ComputedMetricHistory {
	metric_key: string;
	value: number | null;
	metadata: Record<string, unknown>;
	computed_at: string;
}

export interface AIInsight {
	id: string;
	type: 'observation' | 'suggestion' | 'warning' | 'celebration' | 'discovery';
	title: string;
	body: string;
	related_item_id: string | null;
	related_metric: string | null;
	acknowledged_at: string | null;
	action_taken: string | null;
	created_at: string;
}

export interface BurnoutState {
	user_id: string;
	current_phase: 'green' | 'yellow' | 'orange' | 'red';
	score: number;
	contributing_factors: string[];
	last_computed: string;
}

export interface RecoveryLog {
	id: string;
	user_id: string;
	activity_type: string;
	duration_minutes: number;
	effectiveness: number;
	notes: string | null;
	created_at: string;
}

export interface CreateRecoveryPayload {
	protocol_id: string;
	effectiveness: number;    // 1-3
	notes?: string;
}

export interface Digest {
	id: string;
	period_type: 'daily' | 'weekly' | 'monthly';
	period_start: string;
	period_end: string;
	content: DigestContent;
	generated_at: string;
	viewed_at: string | null;
}

export interface DigestContent {
	// API canonical fields (engine: digest.ts queryPeriodData)
	session_count?: number;
	total_hours?: number;
	flow_rate?: number;
	avg_perceived_effort?: number | null;
	avg_hedonic_valence?: number | null;
	avg_energy?: { sleep: number; physical: number; emotional: number; mental: number } | null;
	top_projects?: Array<{ name: string; sessions: number; hours: number }>;
	top_insights?: string[];
	metrics_snapshot?: Record<string, number | null>;
	comparison_to_prior?: { flow_delta: number; hours_delta: number; sessions_delta: number };

	// Legacy / future fields kept optional for forward-compat
	total_sessions?: number;
	total_minutes?: number;
	projects_worked?: number;
	top_project?: string;
	avg_sleep?: number;
	effort_summary?: string;
	insight_highlights?: string[];
	metric_movements?: Array<{ key: string; change: number; direction: 'up' | 'down' | 'stable' }>;
	completed_projects?: string[];
	burnout_status?: string;
	effort_source_mix?: Array<{ source: string; percentage: number }>;
	effort_source_insight?: string;
	[key: string]: unknown;
}

export interface BurnoutEpisode {
	id: string;
	user_id: string;
	started_at: string;
	resolved_at: string | null;
	peak_phase: 'yellow' | 'orange' | 'red';
	contributing_factors: string[];
	resolution_notes: string | null;
}

export interface RecoveryProtocol {
	id: string;
	user_id: string;
	name: string;
	description: string | null;
	is_active: boolean;
	created_at: string;
}

export interface UserProfile {
	[key: string]: unknown;
	user_id: string;
	physical_capability: number;
	mental_capability: number;
	endurance_physical: number;
	endurance_mental: number;
	motivation_intrinsic: number;
	motivation_extrinsic: number;
	calibration_score: number;
	last_calibrated_at: string;
	last_reassessment_at?: string | null;
	created_at: string;
}

export interface ProfileHistoryEntry {
	[key: string]: unknown;
	id: string;
	user_id: string;
	physical_capability: number;
	mental_capability: number;
	endurance_physical: number;
	endurance_mental: number;
	motivation_intrinsic: number;
	motivation_extrinsic: number;
	calibration_score: number;
	recorded_at: string;
}

export interface Suggestion {
	id: string;
	type: 'effort_adjustment' | 'schedule' | 'recovery' | 'general';
	message: string;
	related_item_id: string | null;
	created_at: string;
}

export interface Availability {
	weekly: Record<number, number>; // day_of_week (0-6) → hours
	override_today: number | null;
	effective_today: number;
}

export interface EmraldNotification {
	id: string;
	type: string;
	title: string;
	body: string;
	status: 'pending' | 'read' | 'dismissed';
	created_at: string;
}
