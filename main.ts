import { Plugin, WorkspaceLeaf, Notice, requestUrl } from 'obsidian';
import { EmraldSettingTab, EmraldSettings, DEFAULT_SETTINGS } from './src/settings';
import { EmraldSidebarView, VIEW_TYPE_EMRALD } from './src/views/sidebar';
import { tierState } from './src/tier';
import { EmraldAPIClient } from './src/api/client';
import { FolderSync } from './src/sync/folder-sync';
import { OfflineQueue, QueuedAction } from './src/sync/offline-queue';
import { DataCache } from './src/sync/data-cache';
import {
	VIEW_ELEVEL_OVERVIEW, ELevelOverviewView,
	VIEW_INSIGHT_LOG, InsightLogView,
	VIEW_DATA_CENTER, DataCenterView,
	VIEW_EFFORT_PROFILE, EffortProfileView,
	VIEW_BURNOUT_MONITOR, BurnoutMonitorView,
	VIEW_DIGEST, DigestView,
	VIEW_ABOUT, AboutView
} from './src/views/workspace-views';

export default class EmraldPlugin extends Plugin {
	settings: EmraldSettings;
	apiClient: EmraldAPIClient;
	folderSync: FolderSync;
	offlineQueue: OfflineQueue;
	dataCache: DataCache;
	private syncIntervalId: number | null = null;
	private midnightTimerId: number | null = null;
	private _currentDateStr: string = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

	async onload() {
		await this.loadSettings();

		// Initialize offline queue (restore persisted actions)
		this.offlineQueue = new OfflineQueue();
		const savedQueue = (this.settings as unknown as Record<string, unknown>)._offlineQueue;
		if (Array.isArray(savedQueue)) {
			this.offlineQueue.fromJSON(savedQueue as QueuedAction[]);
		}

		// Initialize data cache (restore persisted cache)
		this.dataCache = new DataCache();
		const savedCache = (this.settings as unknown as Record<string, unknown>)._dataCache;
		if (savedCache && typeof savedCache === 'object') {
			this.dataCache.fromJSON(savedCache as Record<string, import('./src/sync/data-cache').CacheEntry>);
		}

		// Initialize API client
		this.apiClient = new EmraldAPIClient(this.settings.apiKey, this.settings.apiUrl);

		// Wire offline queue and data cache into API client
		this.apiClient.setOfflineQueue(this.offlineQueue);
		this.apiClient.setDataCache(this.dataCache);

		// Persist queue on changes + auto-refresh sidebar on reconnection
		let wasOffline = false;
		this.offlineQueue.setOnStateChange(() => {
			(this.settings as unknown as Record<string, unknown>)._offlineQueue = this.offlineQueue.toJSON();
			void this.saveData(this.settings);

			// Sync cache staleness with online status — serve stale data while offline
			const isNowOnline = this.offlineQueue.isOnline;
			this.dataCache.setForceStale(!isNowOnline);

			// Detect offline → online transition and refresh sidebar.
			// Wait for reconcileAndReplay() to finish before refreshing so
			// queued stop/start actions have been replayed and the server
			// state is consistent when the sidebar calls getActiveSession().
			// Falls back to a 5s max wait to avoid hanging forever (P17 fix).
			if (wasOffline && isNowOnline) {
				void Promise.race([
					this.apiClient.waitForReconciliation(),
					new Promise<void>(r => activeWindow.setTimeout(r, 5000))
				]).then(() => { void this.refreshSidebar(); });
			}
			wasOffline = !isNowOnline;
		});

		// Initialize folder sync
		this.folderSync = new FolderSync(this.app, this.apiClient, {
			activeFolderPath: this.settings.activeFolderPath,
			inactiveFolderPath: this.settings.inactiveFolderPath
		});

		// Register sidebar view
		this.registerView(
			VIEW_TYPE_EMRALD,
			(leaf) => new EmraldSidebarView(leaf, this)
		);

		// Register workspace views
		this.registerView(VIEW_ELEVEL_OVERVIEW, (leaf) => new ELevelOverviewView(leaf, this));
		this.registerView(VIEW_INSIGHT_LOG, (leaf) => new InsightLogView(leaf, this));
		this.registerView(VIEW_DATA_CENTER, (leaf) => new DataCenterView(leaf, this));
		this.registerView(VIEW_EFFORT_PROFILE, (leaf) => new EffortProfileView(leaf, this));
		this.registerView(VIEW_BURNOUT_MONITOR, (leaf) => new BurnoutMonitorView(leaf, this));
		this.registerView(VIEW_DIGEST, (leaf) => new DigestView(leaf, this));
		this.registerView(VIEW_ABOUT, (leaf) => new AboutView(leaf, this));

		// Add ribbon icon to open sidebar
		this.addRibbonIcon('gem', 'EMRALD', () => {
			void this.activateView();
		});

		// ── Keyboard Shortcuts (D.9b) ──────────────────────────

		// Cmd/Ctrl+Shift+S — Start a session (opens project picker)
		this.addCommand({
			id: 'start-session',
			name: 'Start session',
			checkCallback: (checking) => {
				if (!this.settings.apiKey) return false;
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_EMRALD);
				if (leaves.length === 0) return false;
				const view = leaves[0].view as EmraldSidebarView;
				if (checking) return !!view.handleStartSessionRequest;
				view.handleStartSessionRequest?.();
			}
		});

		// Cmd/Ctrl+Shift+. — Stop the active session
		this.addCommand({
			id: 'stop-session',
			name: 'Stop session',
			checkCallback: (checking) => {
				if (!this.settings.apiKey) return false;
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_EMRALD);
				if (leaves.length === 0) return false;
				const view = leaves[0].view as EmraldSidebarView;
				if (checking) {
					// Only available when a session is actually active
					return view.timeblock?.state?.activeSession != null;
				}
				void view.handleStopSession?.();
			}
		});

		// Cmd/Ctrl+Shift+, — Open EMRALD sidebar
		this.addCommand({
			id: 'open-sidebar',
			name: 'Open sidebar',
			callback: () => {
				void this.activateView();
			}
		});

		// Add settings tab
		this.addSettingTab(new EmraldSettingTab(this.app, this));

		// Start folder sync and periodic refresh if API key is configured
		if (this.settings.apiKey) {
			this.startSync();
			this.startMidnightCheck();

			// Wait for Obsidian layout to be ready before touching workspace leaves.
			// During onload(), getRightLeaf/getLeaf('tab') can fail because
			// the workspace DOM isn't fully initialized yet.
			this.app.workspace.onLayoutReady(() => {
				void this.activateView();

				// Auto-open E-Level Overview as "home screen" for returning users
				if (this.settings.onboardingComplete) {
					void this.openWorkspaceView(VIEW_ELEVEL_OVERVIEW);
				}
			});
		}

		// Show onboarding if not completed
		if (!this.settings.onboardingComplete) {
			// Delay to let Obsidian fully load
			activeWindow.setTimeout(() => {
				void (async () => {
					const { OnboardingModal } = await import('./src/onboarding/onboarding');
					const modal = new OnboardingModal(this.app, this, () => {
						// After onboarding completes, activate sidebar + start sync
						void this.activateView();
						if (this.settings.apiKey) {
							this.startSync();
						}
					});
					modal.open();
				})();
			}, 1000);
		}

		// Install tracking ping (fire-and-forget, no auth required).
		// Only pings once per install (installPinged flag persists across sessions).
		void this.pingInstallTracking();

		// Reconcile digest preferences with API on startup (one-shot).
		// Pre-launch fix: existing installs had local digestDay/digestTime that never
		// reached the API, so cron was using the Sunday 18:00 default. This pushes
		// the local truth to the database so the cron uses the right schedule.
		if (this.settings.apiKey) {
			void this.syncDigestPreferences(true); // silent on startup
			void this.reconcileResearchOptIn(); // pull API truth into local settings
		}
	}

	/**
	 * Send install tracking ping on first launch (fire-and-forget).
	 * Generates a stable install_id stored in settings, sends to /v1/plugins/install.
	 * Silently fails on network/server errors — must never block UX.
	 */
	private async pingInstallTracking() {
		try {
			// Generate install_id once (UUID v4)
			if (!this.settings.installId) {
				this.settings.installId = (typeof crypto !== 'undefined' && crypto.randomUUID)
					? crypto.randomUUID()
					: 'i-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
				await this.saveData(this.settings);
			}

			// Skip if already pinged successfully
			if (this.settings.installPinged) return;

			const manifestVersion = this.manifest.version ?? '0.0.0';
			const obsidianVersion = (this.app as unknown as Record<string, string>)?.version ?? 'unknown';
			const apiUrl = this.settings.apiUrl || 'https://api.effortmastery.com/v1';

			const resp = await requestUrl({
				url: `${apiUrl}/plugins/install`,
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					install_id: this.settings.installId,
					plugin_version: manifestVersion,
					obsidian_version: obsidianVersion,
					email: null
				})
			});

			if (resp.status >= 200 && resp.status < 300) {
				this.settings.installPinged = true;
				await this.saveData(this.settings);
			}
		} catch {
			// Silent fail — never block UX. Will retry on next launch.
		}
	}

	onunload() {
		this.stopSync();
		this.stopMidnightCheck();
		this.offlineQueue.destroy();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Record<string, unknown>);
	}

	/**
	 * Sync digest day/time from local settings to /v1/preferences.
	 * Called on settings change and on startup (reconcile).
	 * Maps day-name strings to numbers (0=Sunday…6=Saturday) for the API.
	 * Silently fails — must never block UX.
	 */
	/**
	 * Pull research_opt_in from API into local settings on startup.
	 * Ensures the toggle in Settings reflects server truth.
	 * Silently fails — must never block UX.
	 */
	private async reconcileResearchOptIn(): Promise<void> {
		try {
			if (!this.settings.apiKey) return;
			const resp = await this.apiClient.getPreferences();
			if (resp.data && typeof resp.data.research_opt_in === 'boolean') {
				if (this.settings.researchOptIn !== resp.data.research_opt_in) {
					this.settings.researchOptIn = resp.data.research_opt_in;
					await this.saveData(this.settings);
				}
			}
		} catch { /* non-fatal */
			// Non-fatal
		}
	}

	async syncDigestPreferences(silent: boolean = false): Promise<void> {
		try {
			if (!this.settings.apiKey) return;
			const dayMap: Record<string, number> = {
				sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
				thursday: 4, friday: 5, saturday: 6
			};
			const digest_day = dayMap[this.settings.digestDay] ?? 0;
			// Normalize HH:MM to HH:MM:SS for Postgres time column
			const raw = (this.settings.digestTime || '09:00').trim();
			const digest_time = raw.length === 5 ? `${raw}:00` : raw;
			const resp = await this.apiClient.updatePreferences({ digest_day, digest_time });
			if (!silent) {
				if (resp.error) {
					let msg: string;
					if (typeof resp.error === 'string') {
						msg = resp.error;
					} else {
						const rawMsg = (resp.error as unknown as Record<string, unknown>)?.message;
						msg = typeof rawMsg === 'string' ? rawMsg : 'unknown error';
					}
					new Notice(`Digest schedule sync failed: ${msg}`);
				} else {
					new Notice(`Digest schedule saved: ${this.settings.digestDay} at ${raw} UTC`);
				}
			}
		} catch (err) {
			if (!silent) new Notice(`Digest schedule sync failed: ${String((err as Record<string, unknown>)?.message ?? err)}`);
			if (this.settings.debugLogging) console.warn('[EMRALD] syncDigestPreferences failed:', err);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update API client credentials without recreating (preserves offline queue + cache wiring)
		this.apiClient.updateCredentials(this.settings.apiKey, this.settings.apiUrl);

		// Update folder sync config
		this.folderSync.updateConfig({
			activeFolderPath: this.settings.activeFolderPath,
			inactiveFolderPath: this.settings.inactiveFolderPath
		});

		// Restart sync if API key changed
		this.stopSync();
		if (this.settings.apiKey) {
			this.startSync();
		}
	}

	private startSync() {
		// Start folder watchers
		this.folderSync.start();

		// Run initial full sync
		void this.folderSync.fullSync();

		// Periodic sync — tier-aware interval (Pro: 1 min, Free: 5 min minimum)
		const userSetting = this.settings.syncIntervalMinutes || 5;
		const minInterval = tierState.isPro() ? 1 : 5;
		const effectiveMinutes = Math.max(userSetting, minInterval);
		const intervalMs = effectiveMinutes * 60 * 1000;
		this.syncIntervalId = window.setInterval(() => {
			void this.folderSync.fullSync();
			// Persist data cache periodically
			(this.settings as unknown as Record<string, unknown>)._dataCache = this.dataCache.toJSON();
			void this.saveData(this.settings);
		}, intervalMs);
	}

	private stopSync() {
		this.folderSync.stop();
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
	}

	/**
	 * Check every 30s if the date has rolled over (midnight).
	 * On date change: refresh the sidebar so the day label, daily hours,
	 * and worked-minutes all reset to the new day.
	 */
	private startMidnightCheck() {
		this.midnightTimerId = window.setInterval(() => {
			const now = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
			if (now !== this._currentDateStr) {
				// Date rolled over — refresh sidebar
				this._currentDateStr = now;
				this.refreshSidebar();
			}
		}, 30_000); // check every 30 seconds
	}

	private stopMidnightCheck() {
		if (this.midnightTimerId !== null) {
			window.clearInterval(this.midnightTimerId);
			this.midnightTimerId = null;
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_EMRALD);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			try {
				leaf = workspace.getRightLeaf(false);
			} catch { /* non-fatal */
				console.warn('[EMRALD] Failed to get right sidebar leaf, falling back to tab leaf');
				leaf = null;
			}

			if (!leaf) {
				leaf = workspace.getLeaf('tab');
			}

			await leaf?.setViewState({ type: VIEW_TYPE_EMRALD, active: true });
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
			const view = leaf.view as EmraldSidebarView;
			if (typeof view.refresh === 'function') {
				await view.refresh();
			}
		}
	}

	/**
	 * Refresh the sidebar without revealing/focusing it.
	 * Used for background reconnection refresh.
	 */
	private refreshSidebar() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_EMRALD);
		if (leaves.length > 0) {
			const view = leaves[0].view as EmraldSidebarView;
			// P17 fix: don't rebuild the sidebar while a stop is in progress.
			// The stop handler will reload data itself when it finishes.
			if (view._stoppingSession) {
				// Stop in progress — skip sidebar refresh
				return;
			}
			if (typeof view.refresh === 'function') {
				void view.refresh();
			}
		}
	}

	async openWorkspaceView(viewType: string) {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(viewType);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: viewType, active: true });
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}
}
