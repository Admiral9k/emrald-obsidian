import { ItemView, WorkspaceLeaf, Notice, TFile, SuggestModal, FuzzySuggestModal, Modal, setIcon, Menu, App } from 'obsidian';
import EmraldPlugin from '../../main';
import { TimeblockComponent } from '../components/timeblock';
import { ProjectsComponent } from '../components/projects';
import { EMComponent } from '../components/em';
import { TrackedItem } from '../api/client';
import { tierState } from '../tier';
import { updateSessionStats, isEmraldNote, initializeEmraldFrontmatter, buildNotePathMap } from '../sync/frontmatter';

export const VIEW_TYPE_EMRALD = 'emrald-sidebar';

export class EmraldSidebarView extends ItemView {
	plugin: EmraldPlugin;
	timeblock: TimeblockComponent | null = null;
	private projects: ProjectsComponent | null = null;
	private em: EMComponent | null = null;
	private tierUnsubscribe: (() => void) | null = null;
	private _startingSession = false;
	_stoppingSession = false;
	private _loadingTodayData = false;

	/** Smoothly collapse/expand a section by animating to the real content height */
	private toggleSection(section: HTMLElement, content: HTMLElement, arrowEl: HTMLElement, headerEl?: HTMLElement) {
		const isCollapsing = !section.hasClass('is-collapsed');
		if (isCollapsing) {
			// Set explicit height from current scrollHeight so transition has a start value
			content.setCssProps({ '--section-max-height': content.scrollHeight + 'px' });
			content.addClass('is-animating');
			// Force reflow so the browser registers the starting max-height
			void content.offsetHeight;
			section.addClass('is-collapsed');
			content.setCssProps({ '--section-max-height': '0px' });
			arrowEl.textContent = '▸';
			if (headerEl) headerEl.setAttribute('aria-expanded', 'false');
			// Clean up after transition
			const onEnd = () => {
				content.removeEventListener('transitionend', onEnd);
			};
			content.addEventListener('transitionend', onEnd);
		} else {
			section.removeClass('is-collapsed');
			// Temporarily set explicit max-height for the expand animation
			content.setCssProps({ '--section-max-height': content.scrollHeight + 'px' });
			content.addClass('is-animating');
			arrowEl.textContent = '▼';
			if (headerEl) headerEl.setAttribute('aria-expanded', 'true');
			// After transition, remove inline max-height so content can grow naturally
			const onEnd = () => {
				content.setCssProps({ '--section-max-height': '' });
				content.removeClass('is-animating');
				content.removeEventListener('transitionend', onEnd);
			};
			content.addEventListener('transitionend', onEnd);
		}
	}

	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_EMRALD;
	}

	getDisplayText(): string {
		return 'EMRALD';
	}

	getIcon(): string {
		return 'zap';
	}

	async refresh() {
		await this.onOpen();
	}

	async onOpen() {
		const container = this.containerEl.children[1];

		// Snapshot active session state before destroying the sidebar.
		// This preserves timer state (elapsedMs, totalPausedMs) across
		// sidebar refreshes triggered by reconnect, so loadTodayData()
		// can detect "same session already running" and skip re-initialization.
		if (this.timeblock?.state?.activeSession) {
			(this.plugin as unknown as Record<string, unknown>)._activeSessionSnapshot = this.timeblock.serializeActiveSession();
			// Also snapshot workedMinutes so the green bar / summary don't
			// reset to 0 if the API is unreachable after a sidebar rebuild.
			(this.plugin as unknown as Record<string, unknown>)._workedMinutesSnapshot = this.timeblock.state.workedMinutes;
		}

		container.empty();
		container.addClass('emrald-sidebar');

		// Check if API is configured (API key must exist)
		if (!this.plugin.apiClient.isConfigured()) {
			this.renderUnconfigured(container);
			return;
		}

		// Test connection — non-blocking. Sets offline status if it fails.
		const testResult = await this.plugin.apiClient.testConnection();
		if (testResult.error) {
			if (this.plugin.offlineQueue) {
				this.plugin.offlineQueue.setOnlineStatus(false);
			}
		}

		// Refresh tier state (non-blocking — UI renders immediately, re-renders on change)
		void tierState.refresh(this.plugin.apiClient);

		// Always render the full sidebar — cached data + offline queue handle the rest
		container.empty();
		this.renderSidebar(container);

		// Welcome-back check (non-blocking): show modal if 3+ days since last session
		void this.checkWelcomeBack();
	}

	async onClose() {
		await super.onClose();
		if (this.timeblock) {
			this.timeblock.destroy();
			this.timeblock = null;
		}
		if (this.em) {
			this.em.destroy();
			this.em = null;
		}
		if (this.projects) {
			this.projects = null;
		}
		if (this.tierUnsubscribe) {
			this.tierUnsubscribe();
			this.tierUnsubscribe = null;
		}
	}

	/**
	 * Check if the user hasn't had a session in 3+ days.
	 * Shows a welcome-back modal once per return event.
	 * Uses a persisted flag (_welcomeBackShownDate) so it only fires once per day.
	 */
	private async checkWelcomeBack() {
		try {
			const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

			// Don't show if we already showed today
			const shownDate = (this.plugin.settings as unknown as Record<string, unknown>)._welcomeBackShownDate;
			if (shownDate === todayStr) return;

			// Fetch recent sessions (last 30 days) to find the most recent one
			// Use the list sessions endpoint with a date range
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
			const historyResp = await this.plugin.apiClient.listSessions({
				from: thirtyDaysAgo.toISOString().split('T')[0],
				to: todayStr,
				limit: 5
			});

			if (!historyResp.data || !Array.isArray(historyResp.data) || historyResp.data.length === 0) {
				return; // No sessions at all — user is brand new, not "returning"
			}

			// Find the most recent completed session
			const completed = historyResp.data
				.filter((s) => s.status === 'completed' && s.started_at)
				.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

			if (completed.length === 0) return;

			const lastSessionDate = new Date(completed[0].started_at);
			const now = new Date();
			const daysSince = Math.floor((now.getTime() - lastSessionDate.getTime()) / (1000 * 60 * 60 * 24));

			if (daysSince < 3) return; // Not long enough gap

			// Find last project name
			const lastItemId = completed[0].item_id;
			let lastProjectName = '';
			if (lastItemId) {
				const items = this.plugin.folderSync?.getItems() ?? [];
				const item = items.find(i => i.id === lastItemId);
				lastProjectName = item?.name ?? '';
			}

			// Show the modal
			const { WelcomeBackModal } = await import('../modals/welcome-back');
			const modal = new WelcomeBackModal(this.app, this.plugin, {
				daysSinceLastSession: daysSince,
				lastProjectName
			});
			modal.open();

			// Mark as shown today so it doesn't fire again on sidebar refresh
			(this.plugin.settings as unknown as Record<string, unknown>)._welcomeBackShownDate = todayStr;
			await this.plugin.saveData(this.plugin.settings);
		} catch (e) {
			// Non-critical — don't let this break the sidebar
			console.warn('[EMRALD] Welcome-back check failed:', e);
		}
	}

	private renderLoading(container: Element) {
		const wrap = container.createDiv({ cls: 'emerald-loading' });
		wrap.createDiv({ cls: 'emerald-spinner' });
		wrap.createDiv({ cls: 'emerald-loading-text', text: 'Connecting to EMRALD...' });
	}

	private renderUnconfigured(container: Element) {
		container.createDiv({ cls: 'emerald-unconfigured', text: 'EMRALD is not configured. Please add your API key in settings.' });
	}

	private renderError(container: Element, error: string) {
		const wrap = container.createDiv({ cls: 'emerald-error' });
		wrap.createDiv({ text: `Connection error: ${error}` });
		const retryBtn = wrap.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary emerald-retry-btn',
			text: 'Retry'
		});
		retryBtn.addEventListener('click', () => { void this.onOpen(); });
	}

	private renderSidebar(container: Element) {
		// Header with offline indicator
		const header = container.createDiv({ cls: 'emerald-header' });
		const headerRow = header.createDiv({ cls: 'emerald-header-row' });
		headerRow.createEl('h3', { text: 'EMRALD' });

		// Offline indicator (hidden by default, shown by offline queue state)
		const offlineDot = headerRow.createSpan({ cls: 'emerald-offline-dot' });
		offlineDot.addClass('emrald-hidden');
		offlineDot.title = 'Offline — actions are queued';

		// Check offline state
		if (this.plugin.offlineQueue && !this.plugin.offlineQueue.isOnline) {
			offlineDot.removeClass('emrald-hidden');
		}

		// Notification banner (populated by loadNotifications)
		const notifBanner = container.createDiv({ cls: 'emerald-notif-banner' });
		notifBanner.addClass('emrald-hidden');

		// Three collapsible sections
		this.renderTimeblockSection(container);
		this.renderProjectsSection(container);
		this.renderEMSection(container);

		// Load notifications
		void this.loadNotifications(notifBanner);
	}

	private async loadNotifications(bannerEl: HTMLElement) {
		const resp = await this.plugin.apiClient.getPendingNotifications();
		if (!resp.data || resp.data.length === 0) return;

		// Filter to notifications that actually have content
		const valid = resp.data.filter((n) => n.title?.trim() || n.body?.trim());
		if (valid.length === 0) return;

		bannerEl.removeClass('emrald-hidden');
		bannerEl.empty();

		for (const notif of valid.slice(0, 3)) {
			const row = bannerEl.createDiv({ cls: 'emerald-notif-row' });
			row.createSpan({ cls: 'emerald-notif-title', text: notif.title });
			row.createSpan({ cls: 'emerald-notif-body', text: notif.body });
		}

		if (valid.length > 3) {
			bannerEl.createDiv({ cls: 'emerald-notif-more', text: `+${valid.length - 3} more` });
		}
	}

	private renderTimeblockSection(container: Element) {
		const section = container.createDiv({ cls: 'emerald-section emerald-timeblock' });

		// Format today's date like "Tuesday, April 1"
		const today = new Date();
		const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

		const header = section.createDiv({ cls: 'emerald-section-header' });
		header.setAttribute('role', 'button');
		header.setAttribute('aria-expanded', 'true');
		header.setAttribute('aria-label', `Timeblock — ${dayLabel}`);
		header.tabIndex = 0;
		const headerLeft = header.createSpan({ cls: 'emerald-section-header-left' });
		const arrowEl = headerLeft.createSpan({ cls: 'emerald-section-arrow', text: '▼' });
		arrowEl.setAttribute('aria-hidden', 'true');
		const iconEl = headerLeft.createSpan({ cls: 'emerald-section-icon' });
		setIcon(iconEl, 'timer');
		iconEl.setAttribute('aria-hidden', 'true');
		headerLeft.createSpan({ text: dayLabel });

		const content = section.createDiv({ cls: 'emerald-section-content' });

		header.addEventListener('click', () => {
			this.toggleSection(section, content, arrowEl, header);
		});
		header.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleSection(section, content, arrowEl, header);
			}
		});

		// Initialize timeblock component
		this.timeblock = new TimeblockComponent(this.plugin, content);
		this.timeblock.render();

		// Wire up event handlers
		this.timeblock.onStartRequest = () => this.handleStartSessionRequest();
		this.timeblock.onPause = () => { void this.handlePauseSession(); };
		this.timeblock.onResume = () => { void this.handleResumeSession(); };
		this.timeblock.onStop = () => { void this.handleStopSession(); };
		this.timeblock.onCloseDay = () => { void this.handleCloseDay(); };
		this.timeblock.onHourOverride = () => { void this.handleHourOverride(); };
		this.timeblock.onSessionTick = (elapsedMin: number) => {
			if (this.projects) {
				this.projects.updateSessionProgress(elapsedMin);
			}
		};

		// Load today's session data
		void this.loadTodayData();
	}

	private renderProjectsSection(container: Element) {
		const section = container.createDiv({ cls: 'emerald-section emerald-projects' });

		const header = section.createDiv({ cls: 'emerald-section-header' });
		header.setAttribute('role', 'button');
		header.setAttribute('aria-expanded', 'true');
		header.setAttribute('aria-label', 'Projects');
		header.tabIndex = 0;
		const headerLeft = header.createSpan({ cls: 'emerald-section-header-left' });
		const arrowEl = headerLeft.createSpan({ cls: 'emerald-section-arrow', text: '▼' });
		arrowEl.setAttribute('aria-hidden', 'true');
		const iconEl = headerLeft.createSpan({ cls: 'emerald-section-icon' });
		setIcon(iconEl, 'folder');
		iconEl.setAttribute('aria-hidden', 'true');
		headerLeft.createSpan({ text: 'Projects' });

		const addBtn = header.createSpan({ cls: 'emerald-section-action', text: '+ add' });
		addBtn.setAttribute('role', 'button');
		addBtn.setAttribute('aria-label', 'Add project');
		addBtn.tabIndex = 0;
		addBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const menu = new Menu();
			menu.addItem(i => i
				.setTitle('+ new project')
				.setIcon('file-plus')
				.onClick(() => { void this.handleAddNewProject(); })
			);
			menu.addItem(i => i
				.setTitle('+ link existing note')
				.setIcon('link')
				.onClick(() => { this.handleLinkExistingNote(); })
			);
			menu.showAtMouseEvent(e);
		});
		addBtn.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				addBtn.click();
			}
		});

		header.addEventListener('click', (e: Event) => {
			// Don't toggle if they clicked the context menu button
			if ((e.target as HTMLElement).closest('.emerald-section-header-action')) return;
			if ((e.target as HTMLElement).closest('.emerald-section-action')) return;
			this.toggleSection(section, content, arrowEl, header);
		});
		header.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				if ((e.target as HTMLElement).closest('.emerald-section-action')) return;
				e.preventDefault();
				this.toggleSection(section, content, arrowEl, header);
			}
		});

		const content = section.createDiv({ cls: 'emerald-section-content' });

		// Initialize projects component
		this.projects = new ProjectsComponent(this.plugin, content);
		this.projects.render();

		// Wire up event handlers
		this.projects.onStartSession = (item: TrackedItem) => { void this.handleStartSession(item); };
		this.projects.onPauseSession = () => { void this.handlePauseSession(); };
		this.projects.onStopSession = () => { void this.handleStopSession(); };
		this.projects.onChangeELevel = (item: TrackedItem) => { void this.handleChangeELevel(item); };

		// Load projects
		void this.loadProjects();
	}

	private renderEMSection(container: Element) {
		const section = container.createDiv({ cls: 'emerald-section emerald-em' });

		const header = section.createDiv({ cls: 'emerald-section-header' });
		header.setAttribute('role', 'button');
		header.setAttribute('aria-expanded', 'true');
		header.setAttribute('aria-label', 'Effort management');
		header.tabIndex = 0;
		const headerLeft = header.createSpan({ cls: 'emerald-section-header-left' });
		const arrowEl = headerLeft.createSpan({ cls: 'emerald-section-arrow', text: '▼' });
		arrowEl.setAttribute('aria-hidden', 'true');
		const iconEl = headerLeft.createSpan({ cls: 'emerald-section-icon' });
		setIcon(iconEl, 'bar-chart-2');
		iconEl.setAttribute('aria-hidden', 'true');
		headerLeft.createSpan({ text: 'Effort management' });

		const content = section.createDiv({ cls: 'emerald-section-content' });

		header.addEventListener('click', () => {
			this.toggleSection(section, content, arrowEl, header);
		});
		header.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleSection(section, content, arrowEl, header);
			}
		});

		// Initialize EM component
		this.em = new EMComponent(this.plugin, content);
		this.em.render();

		// Re-render EM section when tier changes (e.g. after async refresh)
		if (this.tierUnsubscribe) this.tierUnsubscribe();
		this.tierUnsubscribe = tierState.onTierChange(() => {
			if (this.em) {
				this.em.render();
			}
		});
	}

	// ── Data Loading ────────────────────────────────────────

	private async loadTodayData() {
		if (!this.timeblock) return;

		// Concurrency guard: skip if already loading to prevent
		// overlapping API calls that cause state oscillation (P19 fix)
		if (this._loadingTodayData) return;
		this._loadingTodayData = true;

		try {

		// Load today's available hours from API
		// API returns a flat array: [{day_of_week, available_hours, user_id}, ...]
		const availResp = await this.plugin.apiClient.getAvailability();
		const availData = availResp.data as unknown as Array<{day_of_week: number; available_hours: number}>;
		if (availData && Array.isArray(availData) && availData.length > 0) {
			const todayDow = new Date().getDay(); // 0=Sun, 6=Sat
			const todayRow = availData.find((r) => r.day_of_week === todayDow);
			const hours = todayRow?.available_hours ?? 0;
			this.timeblock.updateState({ availableHours: hours });
			if (this.projects) this.projects.updateState({ availableHours: hours });
		} else {
			// No availability set yet — default to 0 (prompts user to set it)
			this.timeblock.updateState({ availableHours: 0 });
			if (this.projects) this.projects.updateState({ availableHours: 0 });
		}

		// Load today's sessions to calculate worked minutes (total + per-project)
		const sessionsResp = await this.plugin.apiClient.getTodaySessions();
		const todayMinutesByItem = new Map<string, number>();
		if (sessionsResp.data && Array.isArray(sessionsResp.data)) {
			let totalMinutes = 0;
			for (const session of sessionsResp.data) {
				if (session.duration_minutes && session.status === 'completed') {
					totalMinutes += session.duration_minutes;
					// Accumulate per-project minutes
					const prev = todayMinutesByItem.get(session.item_id) ?? 0;
					todayMinutesByItem.set(session.item_id, prev + session.duration_minutes);
				}
			}
			// Monotonic guard: during an active session, workedMinutes should never
			// decrease. API responses can lag behind local state (e.g., a just-stopped
			// session not yet appearing as 'completed'), causing the display to jump
			// backward momentarily. Only allow increases. (P19 regression fix)
			if (this.timeblock.state.activeSession && totalMinutes < this.timeblock.state.workedMinutes) {
				// Keep existing higher value — don't regress
			} else {
				this.timeblock.updateState({ workedMinutes: totalMinutes });
			}
		} else {
			// API failed and no cache — fall back to snapshotted workedMinutes
			// so the green bar / summary don't reset to 0 during offline rebuilds.
			const snapshotMinutes = (this.plugin as unknown as Record<string, unknown>)._workedMinutesSnapshot as number | undefined;
			if (snapshotMinutes != null && snapshotMinutes > 0) {
				this.timeblock.updateState({ workedMinutes: snapshotMinutes });
			}
		}

		// Push per-project minutes to the projects component
		if (this.projects) {
			this.projects.updateState({ todayMinutesByItem });
		}

		// Restore active session snapshot from a previous sidebar instance
		// (e.g., after reconnect triggers refreshSidebar → onOpen → new timeblock).
		// This gives the new timeblock instance the timer state so the
		// session-aware check below can detect "same session already running."
		const snapshot = (this.plugin as unknown as Record<string, unknown>)._activeSessionSnapshot as Record<string, unknown> | null;
		if (snapshot && this.timeblock && !this.timeblock.state.activeSession) {
			this.timeblock.restoreActiveSession(snapshot);
			if (this.projects && snapshot.itemId) {
				this.projects.updateState({ activeSessionItemId: snapshot.itemId as string });
			}
			// Clear snapshot so it doesn't re-apply on subsequent loadTodayData calls
			(this.plugin as unknown as Record<string, unknown>)._activeSessionSnapshot = null;
			(this.plugin as unknown as Record<string, unknown>)._workedMinutesSnapshot = null;
		}

		// Check for active session
		// P17 fix: skip re-initialization if a stop is currently in progress
		// (sidebar refresh can race with the user's stop action on reconnect)
		if (this._stoppingSession) {
			// Stop in progress — skip active session check
			return;
		}
		const activeResp = await this.plugin.apiClient.getActiveSession();
		if (activeResp.data) {
			const session = activeResp.data;
			if (session) {
				// P17 fix: if there's a queued stop action for this session,
				// the server hasn't processed it yet. Don't re-initialize as active.
				if (this.plugin.offlineQueue.hasQueuedAction('POST', `/sessions/${session.id}/stop`)) {
					// Active session has queued stop — skip re-init
					return;
				}
				// Guard: auto-discard stale sessions older than 24h
				const sessionAge = Date.now() - new Date(session.started_at).getTime();
				const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
				if (sessionAge > TWENTY_FOUR_HOURS) {
					try {
						const discardResp = await this.plugin.apiClient.discardSession(session.id);
						if (discardResp.error && !discardResp.queued) {
							console.warn('[EMRALD] Failed to discard stale session:', discardResp.error);
						}
						new Notice(discardResp.queued
							? 'Stale session queued for discard — will sync when online.'
							: 'Discarded a stale session from yesterday.');
					} catch (e) {
						console.error('[EMRALD] Error discarding stale session:', e);
						new Notice('Found a stale session but could not discard it — try refreshing.');
					}
					// Always return — never render a session older than 24h
					return;
				}

				// If a session is already running locally with the same ID,
				// DON'T reinitialize — just update priorMinutesToday so the
				// E-level marker and project card stay accurate without
				// resetting elapsedMs/totalPausedMs (which causes timer jumps).
				const currentLocal = this.timeblock.state.activeSession;
				if (currentLocal && (currentLocal.sessionId === session.id ||
					(currentLocal.isPendingSync && currentLocal.itemId === session.item_id) ||
					(currentLocal.itemId === session.item_id &&
					 Math.abs(currentLocal.startedAt.getTime() - new Date(session.started_at).getTime()) < 5000))) {
					// Session already running locally — just refresh priorMinutesToday
					let priorMinutes = 0;
					if (sessionsResp.data && Array.isArray(sessionsResp.data)) {
						for (const s of sessionsResp.data) {
							if (s.item_id === session.item_id && s.status === 'completed' && s.duration_minutes) {
								priorMinutes += s.duration_minutes;
							}
						}
					}
					currentLocal.priorMinutesToday = priorMinutes;

					// If this was a provisional session that's now on the server,
					// upgrade it to a real session (clear pending sync flag, adopt real ID)
					if (currentLocal.isPendingSync) {
						currentLocal.sessionId = session.id;
						currentLocal.isPendingSync = false;
						this.timeblock.renderControls();
						void this.clearPersistedProvisionalSession();
					}

					// Ensure project highlight is correct
					if (this.projects) {
						this.projects.updateState({ activeSessionItemId: currentLocal.itemId });
					}
					return;
				}

				// No local session running (initial load / recovery) — initialize fully
				let item = this.projects?.state?.items?.find(i => i.id === session.item_id);
				if (!item) {
					const items = this.plugin.folderSync.getItems();
					item = items.find(i => i.id === session.item_id);
				}
				if (item) {
					// Calculate prior completed minutes for this project today
					let priorMinutes = 0;
					if (sessionsResp.data && Array.isArray(sessionsResp.data)) {
						for (const s of sessionsResp.data) {
							if (s.item_id === item.id && s.status === 'completed' && s.duration_minutes) {
								priorMinutes += s.duration_minutes;
							}
						}
					}
					this.timeblock.startSession(session, item, priorMinutes);

					// Ensure project highlight is restored
					if (this.projects) {
						this.projects.updateState({ activeSessionItemId: item.id });
					}

					// Clear any stale provisional session since we have a real one
					void this.clearPersistedProvisionalSession();
				}
			}
		} else {
			// No active remote session — check for a local provisional session
			this.restoreProvisionalSession();
		}

		} finally {
			this._loadingTodayData = false;
		}
	}

	// ── Session Handlers ────────────────────────────────────

	handleStartSessionRequest() {
		// Show a quick project picker from active projects
		if (!this.projects) {
			new Notice('No projects loaded yet.');
			console.warn('[EMRALD] Start button: projects component is null');
			return;
		}
		const activeItems = this.projects.state.items.filter(i => i.status === 'active');

		if (activeItems.length === 0) {
			new Notice('No active projects. Add one first.');
			return;
		}

		const handleStart = (item: TrackedItem) => { void this.handleStartSession(item); };

		class ProjectPickerModal extends FuzzySuggestModal<TrackedItem> {
			getItems() { return activeItems; }
			getItemText(item: TrackedItem) { return `${item.name} (${item.effort_level})`; }
			onChooseItem(item: TrackedItem) {
				handleStart(item);
			}
		}

		const picker = new ProjectPickerModal(this.app);
		picker.setPlaceholder('Pick a project to start...');
		picker.open();
	}

	private async handleStartSession(item: TrackedItem) {
		if (!this.timeblock) return;

		// Check if Advanced calibration questions are due
		const { checkAdvancedCalibrationNeeded, AdvancedCalibrationModal } = await import('../modals/advanced-calibration');
		const calibrationNeeded = await checkAdvancedCalibrationNeeded(this.plugin);

		if (calibrationNeeded) {
			// Show calibration questions before starting session
			const modal = new AdvancedCalibrationModal(
				this.app,
				this.plugin,
				calibrationNeeded.answeredKeys,
				calibrationNeeded.remaining,
				() => { void this.doStartSession(item); },  // After answering, start session
				() => { void this.doStartSession(item); }   // Skip also starts session
			);
			modal.open();
			return;
		}

		await this.doStartSession(item);
	}

	private async doStartSession(item: TrackedItem) {
		if (!this.timeblock) return;

		// Guard: prevent double-click session stacking
		if (this._startingSession || this.timeblock.state.activeSession) {
			return;
		}
		this._startingSession = true;

		try {

		// Prevent duplicate offline queued starts for the same item
		if (this.plugin.offlineQueue.hasQueuedAction('POST', '/sessions', (body) => {
			const payload = body as Record<string, unknown> | undefined;
			return payload?.item_id === item.id;
		})) {
			new Notice(`Session start already queued for ${item.name}. Reconnect to sync it.`);
			return;
		}

		// Start session via API
		const resp = await this.plugin.apiClient.startSession(item.id);
		if (resp.queued) {
			// Offline — create local provisional session so controls work
			const todayMin = this.projects?.state?.todayMinutesByItem?.get(item.id) ?? 0;
			this.timeblock.startProvisionalSession(item, todayMin);

			// Update projects
			if (this.projects) {
				this.projects.updateState({ activeSessionItemId: item.id });
			}

			// Persist provisional session for reload recovery
			await this.persistProvisionalSession();

			new Notice(`Offline — session started locally for ${item.name}. It will sync when you're back online.`);
			return;
		}
		if (resp.error || !resp.data) {
			new Notice(`Failed to start session: ${resp.error}`);
			return;
		}

		// Calculate prior minutes today for this project
		const todayMin = this.projects?.state?.todayMinutesByItem?.get(item.id) ?? 0;

		// Update timeblock
		this.timeblock.startSession(resp.data, item, todayMin);

		// Update projects
		if (this.projects) {
			this.projects.updateState({ activeSessionItemId: item.id });
		}

		new Notice(`Session started: ${item.name}`);

		} finally {
			this._startingSession = false;
		}
	}

	private async handlePauseSession() {
		if (!this.timeblock) return;
		const session = this.timeblock.state.activeSession;
		if (!session) return;

		const resp = await this.plugin.apiClient.pauseSession(session.sessionId);
		if (!resp.error || resp.queued) {
			// Success or queued offline — update local state either way
			this.timeblock.pauseSession();
			if (session.isPendingSync) await this.persistProvisionalSession();
		} else {
			new Notice(`Failed to pause: ${resp.error}`);
		}
	}

	private async handleResumeSession() {
		if (!this.timeblock) return;
		const session = this.timeblock.state.activeSession;
		if (!session) return;

		const resp = await this.plugin.apiClient.resumeSession(session.sessionId);
		if (!resp.error || resp.queued) {
			this.timeblock.resumeSession();
			if (session.isPendingSync) await this.persistProvisionalSession();
		}
	}

	async handleStopSession() {
		if (!this.timeblock) return;
		const session = this.timeblock.state.activeSession;
		if (!session) return;

		// Guard: prevent double-stop from sidebar refresh racing with user action
		if (this._stoppingSession) return;
		this._stoppingSession = true;

		try {

		// Capture timing data before clearing local state
		const sessionMinutes = this.timeblock.getSessionMinutes();
		const metPrescribedEffort = this.timeblock.hasMetPrescribedEffort();

		// Guard: if session is over 24h, it's a runaway — offer discard or keep
		const TWENTY_FOUR_HOURS_MIN = 24 * 60;
		if (sessionMinutes > TWENTY_FOUR_HOURS_MIN) {
			const runawayModal = new RunawaySessionModal(
				this.app,
				session.itemName,
				sessionMinutes,
				(action: string) => { void (async () => {
					if (action === 'discard') {
						await this.plugin.apiClient.discardSession(session.sessionId);
						new Notice('Runaway session discarded — no data recorded.');
						this.timeblock?.stopSession();
						if (this.projects) {
							this.projects.updateState({ activeSessionItemId: null });
						}
						await this.loadTodayData();
						void this.loadProjects();
					} else {
						// 'keep' — stop on API flagged as recovered, then show effort receipt
						await this.plugin.apiClient.stopSession(session.sessionId, { was_recovered: true });
						this.timeblock?.stopSession();
						if (this.projects) {
							this.projects.updateState({ activeSessionItemId: null });
						}
						await this.loadTodayData();
						void this.clearPersistedProvisionalSession();
						// Open effort receipt (same as normal stop flow)
						const { EffortReceiptModal } = await import('../modals/effort-receipt');
						const receiptModal = new EffortReceiptModal(
							this.app,
							this.plugin,
							{
								sessionId: session.sessionId,
								itemName: session.itemName,
								effortLevel: session.effortLevel,
								sessionMinutes,
								metPrescribedEffort
							},
							(receipt: import("../api/client").CreateReceiptPayload, markComplete: boolean) => { void (async () => {
								const resp = await this.plugin.apiClient.submitReceipt(session.sessionId, receipt);
								if (!resp.error || resp.queued) {
									new Notice(resp.queued ? 'Receipt queued — will sync when online' : 'Session recorded');
									if (markComplete) {
										await this.plugin.apiClient.updateItem(session.itemId, { status: 'completed' });
										new Notice(`${session.itemName} marked complete`);
									}
									void this.loadTodayData();
									void this.loadProjects();
									await this.updateFrontmatterStats(session.itemId);
								}
							})(); }
						);
						receiptModal.open();
					}
					this._stoppingSession = false;
				})(); }
			);
			runawayModal.open();
			return;
		}

		// Stop session on API (or queue if offline)
		const stopResp = await this.plugin.apiClient.stopSession(session.sessionId);
		if (stopResp.error && !stopResp.queued) {
			// If the API says session is already stopped or not found (400/404),
			// still clear local state so the user isn't stuck.
			if (stopResp.status === 400 || stopResp.status === 404) {
				console.warn(`[EMRALD] Stop returned ${stopResp.status} — clearing local state anyway:`, stopResp.error);
				new Notice('Session may have already ended — clearing local state.');
			} else {
				new Notice(`Failed to stop session: ${stopResp.error}`);
				return;
			}
		}

		// Clear local state immediately (don't wait for receipt)
		this.timeblock.stopSession();
		if (this.projects) {
			this.projects.updateState({ activeSessionItemId: null });
		}

		// Reload today's data from API as single source of truth for minutes.
		// This replaces the old manual todayMinutesByItem patch that caused
		// oscillating timers when the API refresh raced with local state.
		await this.loadTodayData();

		// Clear persisted provisional session
		void this.clearPersistedProvisionalSession();

		if (stopResp.queued) {
			new Notice(`Session stopped locally — will sync when online.`);
		}

		// Skip effort receipt for sessions under 5 minutes (too short for meaningful data)
		const MIN_RECEIPT_MINUTES = 5;
		if (sessionMinutes < MIN_RECEIPT_MINUTES) {
			new Notice(`Session too short for receipt (${Math.round(sessionMinutes)}m < ${MIN_RECEIPT_MINUTES}m). Recorded without receipt.`);
			void this.loadTodayData();
			void this.loadProjects();
			return;
		}

		// Open Effort Receipt modal
		const { EffortReceiptModal } = await import('../modals/effort-receipt');
		const modal = new EffortReceiptModal(
			this.app,
			this.plugin,
			{
				sessionId: session.sessionId,
				itemName: session.itemName,
				effortLevel: session.effortLevel,
				sessionMinutes,
				metPrescribedEffort
			},
			(receipt: import("../api/client").CreateReceiptPayload, markComplete: boolean) => { void (async () => {
				// Submit receipt
				const resp = await this.plugin.apiClient.submitReceipt(session.sessionId, receipt);
				if (!resp.error || resp.queued) {
					new Notice(resp.queued ? 'Receipt queued — will sync when online' : 'Session recorded');

					// Mark complete if requested
					if (markComplete) {
						await this.plugin.apiClient.updateItem(session.itemId, { status: 'completed' });
						new Notice(`${session.itemName} marked complete`);
					}

					// Reload data (will use cache if offline)
					void this.loadTodayData();
					void this.loadProjects();

					// Update frontmatter session stats if note is linked
					await this.updateFrontmatterStats(session.itemId);

					// Celebration modal — one-time only (first receipt ever)
					if (!this.plugin.settings.celebrationShown) {
						const { CelebrationModal } = await import('../modals/celebration');
						const celebrationModal = new CelebrationModal(
							this.app,
							this.plugin,
							{
								itemName: session.itemName,
								effortLevel: session.effortLevel,
								sessionMinutes,
								availableHours: this.timeblock?.state?.availableHours ?? 4
							}
						);
						celebrationModal.open();
						this.plugin.settings.celebrationShown = true;
						await this.plugin.saveData(this.plugin.settings);
					}
				}
			})(); }
		);
		modal.open();
		} finally {
			this._stoppingSession = false;
		}
	}

	private async handleCloseDay() {
		if (!this.timeblock) return;
		const workedMin = this.timeblock.state.workedMinutes;
		const availableH = this.timeblock.state.availableHours;

		// Build project breakdown from today's sessions
		let sessionCount = 0;
		const projectMap = new Map<string, { name: string; minutes: number; sessions: number }>();

		const sessionsResp = await this.plugin.apiClient.getTodaySessions();
		if (sessionsResp.data && Array.isArray(sessionsResp.data)) {
			for (const sess of sessionsResp.data) {
				if (sess.status === 'completed' && sess.duration_minutes) {
					sessionCount++;
					const existing = projectMap.get(sess.item_id);
					if (existing) {
						existing.minutes += sess.duration_minutes;
						existing.sessions++;
					} else {
						// Try to find project name
						const items = this.projects?.state?.items ?? [];
						const item = items.find(i => i.id === sess.item_id);
						projectMap.set(sess.item_id, {
							name: item?.name ?? 'Unknown project',
							minutes: sess.duration_minutes,
							sessions: 1
						});
					}
				}
			}
		}

		const { CloseDayModal } = await import('../modals/close-day');
		const modal = new CloseDayModal(
			this.app,
			this.plugin,
			{
				plannedHours: availableH,
				workedMinutes: workedMin,
				sessionCount,
				projectBreakdown: Array.from(projectMap.values())
			},
			() => {
				this.timeblock?.closeDay();
				new Notice('Day closed');
			}
		);
		modal.open();
	}

	private async handleHourOverride() {
		if (!this.timeblock) return;
		const currentHours = this.timeblock.state.availableHours ?? 0;

		// Try to get base schedule from API
		// API returns flat array: [{day_of_week, available_hours}, ...]
		let baseScheduleHours: number | null = null;
		const availResp = await this.plugin.apiClient.getAvailability();
		const availArr = availResp.data as unknown as Array<{day_of_week: number; available_hours: number}>;
		if (availArr && Array.isArray(availArr)) {
			const dow = new Date().getDay();
			const todayRow = availArr.find((r) => r.day_of_week === dow);
			baseScheduleHours = todayRow?.available_hours ?? null;
		}

		const { HourOverrideModal } = await import('../modals/hour-override');
		const modal = new HourOverrideModal(
			this.app,
			this.plugin,
			currentHours,
			baseScheduleHours,
			(hours: number) => { void (async () => {
				// Persist override to API
				const today = new Date().toISOString().split('T')[0];
				await this.plugin.apiClient.setAvailabilityOverride(today, hours);
			this.timeblock?.updateState({ availableHours: hours });
				// Recalculate E-level marker position with new hours
				if (this.timeblock?.state?.activeSession) {
					this.timeblock.updateELevelMarker();
				}
				// Update projects component so prescribed time text recalculates
				if (this.projects) {
					this.projects.updateState({ availableHours: hours });
					// Force re-render of in-session progress if active
					if (this.timeblock?.state?.activeSession) {
						this.projects.updateSessionProgress(this.timeblock.state.activeSession.elapsedMs / 60000);
					}
				}
				new Notice(`Today's hours set to ${hours}h`);
			})(); }
		);
		modal.open();
	}

	// ── Add Project (split into New + Link) ────────────────

	private async handleAddNewProject() {
		// Enforce 5-active-project cap
		const activeCount = this.projects?.state?.items?.filter(i => i.status === 'active').length ?? 0;
		if (activeCount >= 5) {
			new Notice('You already have 5 active projects. Complete or deactivate one first.');
			return;
		}

		// Simple name-input modal — no file search, just a project name
		const availableHours = this.timeblock?.state?.availableHours ?? 4;

		const { NewProjectModal } = await import('../modals/new-project');
		const modal = new NewProjectModal(
			this.app,
			this.plugin,
			(name: string, level: 'E1' | 'E2' | 'E3' | 'E4') => { void (async () => {
				const resp = await this.plugin.apiClient.createItem({
					name,
					effort_level: level,
					obsidian_note_path: undefined
				});
				if (resp.error || !resp.data) {
					new Notice(`Failed to create project: ${resp.error}`);
					return;
				}
				new Notice(`Created: ${name}`);
				void this.loadProjects();
				this.restoreActiveSessionHighlight();
			})(); },
			availableHours
		);
		modal.open();
	}

	private handleLinkExistingNote() {
		// Enforce 5-active-project cap
		const activeCount = this.projects?.state?.items?.filter(i => i.status === 'active').length ?? 0;
		if (activeCount >= 5) {
			new Notice('You already have 5 active projects. Complete or deactivate one first.');
			return;
		}

		// Fuzzy note search — picks an existing vault file to link
		const files = this.app.vault.getMarkdownFiles();
		const availableHours = this.timeblock?.state?.availableHours ?? 4;

		const picker = new AddProjectSuggestModal(
			this.app,
			files,
			(file: import("obsidian").TFile) => { void (async () => {
				const name = file.basename;

				const { ELevelModal } = await import('../modals/elevel');
				const modal = new ELevelModal(
					this.app,
					this.plugin,
					name,
					'E2',
					availableHours,
					(level: 'E1' | 'E2' | 'E3' | 'E4') => { void (async () => {
						const resp = await this.plugin.apiClient.createItem({
							name,
							effort_level: level,
							obsidian_note_path: file.path
						});
						if (resp.error || !resp.data) {
							new Notice(`Failed to create project: ${resp.error}`);
							return;
						}
						await initializeEmraldFrontmatter(this.app, file, resp.data.id, level);
						new Notice(`Created & linked: ${name}`);
						void this.loadProjects();
						this.restoreActiveSessionHighlight();
					})(); }
				);
				modal.open();
			})(); }
		);
		picker.open();
	}

	private restoreActiveSessionHighlight() {
		if (this.timeblock?.state?.activeSession) {
			const activeItemId = this.timeblock.state.activeSession.itemId;
			if (this.projects) {
				this.projects.updateState({ activeSessionItemId: activeItemId });
			}
		}
	}

	private async handleChangeELevel(item: TrackedItem) {
		const availableHours = this.timeblock?.state?.availableHours ?? 4;

		const { ELevelModal } = await import('../modals/elevel');
		const modal = new ELevelModal(
			this.app,
			this.plugin,
			item.name,
			item.effort_level,
			availableHours,
			(level: 'E1' | 'E2' | 'E3' | 'E4') => { void (async () => {
				const resp = await this.plugin.apiClient.updateItem(item.id, { effort_level: level });
				if (!resp.error) {
					new Notice(`${item.name} → ${level}`);
					void this.loadProjects();
				}
			})(); }
		);
		modal.open();
	}

	// ── Data Loading ────────────────────────────────────────

	private async updateFrontmatterStats(itemId: string) {
		// Find the note linked to this item — check local state first, then scan frontmatter
		const items = this.projects?.state?.items ?? [];
		const item = items.find(i => i.id === itemId);
		let notePath = item?.obsidian_note_path;

		// If not on the item, scan vault frontmatter for the emrald-id
		if (!notePath) {
			const notePathMap = buildNotePathMap(this.plugin.app);
			notePath = notePathMap.get(itemId);
		}
		if (!notePath) return;

		const file = this.plugin.app.vault.getAbstractFileByPath(notePath);
		if (!file || !(file instanceof TFile)) return;
		if (!isEmraldNote(this.plugin.app, file)) return;

		// Fetch ALL sessions for this item (lifetime stats, not just today)
		const allResp = await this.plugin.apiClient.getItemSessionStats(itemId);
		let sessionCount = 0;
		let totalMinutes = 0;
		let lastSessionDate = new Date().toISOString().split('T')[0];

		if (allResp.data && Array.isArray(allResp.data)) {
			for (const s of allResp.data) {
				if (s.status === 'completed') {
					sessionCount++;
					totalMinutes += s.duration_minutes ?? 0;
				}
			}
			// Find the most recent completed session date
			const completed = allResp.data.filter(s => s.status === 'completed' && s.started_at);
			if (completed.length > 0) {
				completed.sort((a, b) => b.started_at.localeCompare(a.started_at));
				lastSessionDate = completed[0].started_at.split('T')[0];
			}
		}

		if (sessionCount > 0) {
			await updateSessionStats(
				this.plugin.app,
				file,
				sessionCount,
				totalMinutes,
				lastSessionDate
			);
		}
	}

	private async loadProjects() {
		if (!this.projects) return;

		// Always fetch from API first — folder sync may not have items
		const resp = await this.plugin.apiClient.getItems();
		let items: TrackedItem[] = [];

		if (resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
			items = resp.data;
		} else {
			// Fallback to folder sync
			items = this.plugin.folderSync.getItems();
		}

		// Enrich items with vault note paths via frontmatter emrald-id scan
		if (items.length > 0) {
			const notePathMap = buildNotePathMap(this.plugin.app);
			for (const item of items) {
				if (!item.obsidian_note_path) {
					const notePath = notePathMap.get(item.id);
					if (notePath) {
						item.obsidian_note_path = notePath;
					}
				}
			}
			this.projects.updateState({ items });
		}
	}

	// ── Provisional Session Persistence ──────────────────────

	/**
	 * Save local provisional session to plugin data so it survives reloads.
	 */
	private async persistProvisionalSession() {
		if (!this.timeblock) return;
		const serialized = this.timeblock.serializeActiveSession();
		(this.plugin.settings as unknown as Record<string, unknown>)._provisionalSession = serialized;
		await this.plugin.saveData(this.plugin.settings);
	}

	/**
	 * Clear persisted provisional session data.
	 */
	private async clearPersistedProvisionalSession() {
		(this.plugin.settings as unknown as Record<string, unknown>)._provisionalSession = null;
		await this.plugin.saveData(this.plugin.settings);
	}

	/**
	 * Restore provisional session on view open (if one was active before reload).
	 */
	private restoreProvisionalSession() {
		if (!this.timeblock) return;
		// Don't restore if we already have an active session (e.g., from snapshot)
		if (this.timeblock.state.activeSession) return;
		const saved = (this.plugin.settings as unknown as Record<string, unknown>)._provisionalSession;
		if (!saved || typeof saved !== 'object') return;

		const data = saved as Record<string, unknown>;

		// Only restore if it's pending sync (local provisional)
		// and less than 24 hours old
		if (!data.isPendingSync) return;
		const startedAt = new Date(data.startedAt as string);
		if (Date.now() - startedAt.getTime() > 24 * 60 * 60 * 1000) {
			// Too old — clear it
			void this.clearPersistedProvisionalSession();
			return;
		}

		this.timeblock.restoreActiveSession(data);

		// Restore project highlight
		if (this.projects && data.itemId) {
			this.projects.updateState({ activeSessionItemId: data.itemId as string });
		}
	}
}

// ── Add Project Suggest Modal ───────────────────────────────
// Shows vault notes for linking an existing note to a new project.

class AddProjectSuggestModal extends SuggestModal<TFile> {
	private files: TFile[];
	private onChoose: (file: TFile) => void;

	constructor(app: import('obsidian').App, files: TFile[], onChoose: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onChoose = onChoose;
		this.setPlaceholder('Search for a note to link...');
	}

	getSuggestions(query: string): TFile[] {
		if (!query) return this.files;
		const lower = query.toLowerCase();
		return this.files.filter(f =>
			f.path.toLowerCase().includes(lower) ||
			f.basename.toLowerCase().includes(lower)
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ text: file.basename });
		el.createEl('small', { text: file.path, cls: 'emerald-suggest-path' });
	}

	onChooseSuggestion(file: TFile): void {
		this.onChoose(file);
	}
}

// ── Runaway Session Modal ───────────────────────────────

class RunawaySessionModal extends Modal {
	constructor(
		app: App,
		private itemName: string,
		private sessionMinutes: number,
		private onAction: (action: 'discard' | 'keep') => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('emerald-modal', 'emerald-runaway-modal');
		const hours = Math.floor(this.sessionMinutes / 60);
		const mins = Math.round(this.sessionMinutes % 60);

		contentEl.createEl('h2', { text: '⚠ Runaway session detected' });
		contentEl.createEl('p', {
			text: `"${this.itemName}" has been running for ${hours}h ${mins}m — that's over 24 hours. This usually means the session was left running accidentally.`
		});
		contentEl.createEl('p', {
			text: 'What would you like to do?',
			cls: 'emerald-modal-subtitle'
		});

		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		const discardBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Discard — don\'t count it'
		});
		discardBtn.addEventListener('click', () => {
			this.onAction('discard');
			this.close();
		});

		const keepBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Keep — record it anyway'
		});
		keepBtn.addEventListener('click', () => {
			this.onAction('keep');
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
