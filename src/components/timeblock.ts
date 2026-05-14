// EMRALD Timeblock Component
// Renders the 24-hour timeblock bar with session tracking.
// Idle: ticks scroll in real time. Active: ticks freeze, green bar fills.

import EmraldPlugin from '../../main';
import { TrackedItem, Session } from '../api/client';
import { createIconEl, ICONS } from '../utils/icons';

// E-level prescribed duration as percentage of daily available hours
const E_LEVEL_PERCENT: Record<string, number> = {
	E1: 0.25,
	E2: 0.50,
	E3: 0.75,
	E4: 1.00
};

export interface TimeblockState {
	availableHours: number;       // Today's available hours (from availability or override)
	workedMinutes: number;        // Total minutes worked today (all projects)
	activeSession: ActiveSessionState | null;
	dayIsClosed: boolean;
}

export interface ActiveSessionState {
	sessionId: string;
	itemId: string;
	itemName: string;
	effortLevel: 'E1' | 'E2' | 'E3' | 'E4';
	startedAt: Date;
	pausedAt: Date | null;
	elapsedMs: number;            // Total elapsed (excluding pauses)
	totalPausedMs: number;        // Cumulative time spent paused
	priorMinutesToday: number;    // Minutes already worked on this project today
	isPendingSync?: boolean;      // True if session was started offline and hasn't synced yet
}

export class TimeblockComponent {
	private plugin: EmraldPlugin;
	private containerEl: HTMLElement;
	public state: TimeblockState;

	// DOM references
	private tickBarEl: HTMLElement | null = null;
	private greenBarEl: HTMLElement | null = null;
	private eLevelMarkerEl: HTMLElement | null = null;
	private dailyHoursMarkerEl: HTMLElement | null = null;
	private overtimeBarEl: HTMLElement | null = null;
	private timerEl: HTMLElement | null = null;
	private summaryEl: HTMLElement | null = null;
	private barLabelEl: HTMLElement | null = null;
	private controlsEl: HTMLElement | null = null;

	// Animation
	private tickAnimationId: number | null = null;
	private sessionIntervalId: number | null = null;

	constructor(plugin: EmraldPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.state = {
			availableHours: 4, // Default, will be loaded from API
			workedMinutes: 0,
			activeSession: null,
			dayIsClosed: false
		};
	}

	/**
	 * Render the full timeblock section.
	 */
	render() {
		this.containerEl.empty();
		this.containerEl.addClass('emerald-timeblock-content');

		// Timer display (visible during active session)
		this.timerEl = this.containerEl.createDiv({ cls: 'emerald-timer' });
		if (!this.state.activeSession) this.timerEl.addClass('emrald-hidden');

		// Tick bar container
		const barWrapper = this.containerEl.createDiv({ cls: 'emerald-bar-wrapper' });
		this.tickBarEl = barWrapper.createDiv({ cls: 'emerald-tick-bar' });
		this.greenBarEl = barWrapper.createDiv({ cls: 'emerald-green-bar' });
		this.overtimeBarEl = barWrapper.createDiv({ cls: 'emerald-overtime-bar' });
		this.eLevelMarkerEl = barWrapper.createDiv({ cls: 'emerald-elevel-marker' });
		this.eLevelMarkerEl.addClass('emrald-hidden');
		this.dailyHoursMarkerEl = barWrapper.createDiv({ cls: 'emerald-dh-marker' });
		this.updateDailyHoursMarker();

		// Bar label — "Today: Xh Xm / Yh worked" sits right below the bar
		this.barLabelEl = this.containerEl.createDiv({ cls: 'emerald-bar-label' });

		// Render tick marks
		this.renderTicks();

		// Controls
		this.controlsEl = this.containerEl.createDiv({ cls: 'emerald-controls' });
		this.renderControls();

		// Summary
		this.summaryEl = this.containerEl.createDiv({ cls: 'emerald-summary' });
		this.renderSummary();

		// Start appropriate animation
		if (this.state.activeSession) {
			this.startSessionAnimation();
		} else {
			this.startIdleAnimation();
		}
	}

	/**
	 * Update state and re-render relevant parts.
	 */
	updateState(partial: Partial<TimeblockState>) {
		Object.assign(this.state, partial);
		this.renderControls();
		this.renderSummary();
		this.updateBars();
		// Reposition DH marker if available hours changed
		if ('availableHours' in partial) {
			this.updateDailyHoursMarker();
		}
	}

	/**
	 * Start a new session.
	 */
	startSession(session: Session, item: TrackedItem, priorMinutesToday: number) {
		// Calculate elapsed time from server start time (handles reconnect/restore correctly)
		const startedAt = new Date(session.started_at);
		const wallElapsed = Math.max(0, Date.now() - startedAt.getTime());
		// Carry over pause state from server if available, otherwise assume 0
		const totalPausedMs = (session.pause_duration_minutes ?? 0) * 60000;

		this.state.activeSession = {
			sessionId: session.id,
			itemId: item.id,
			itemName: item.name,
			effortLevel: item.effort_level,
			startedAt: startedAt,
			pausedAt: session.status === 'paused' ? new Date() : null,
			elapsedMs: wallElapsed - totalPausedMs,
			totalPausedMs: totalPausedMs,
			priorMinutesToday: priorMinutesToday
		};

		this.stopIdleAnimation();
		this.startSessionAnimation();
		this.renderControls();
		this.updateBars();

		if (this.timerEl) this.timerEl.removeClass('emrald-hidden');
		if (this.eLevelMarkerEl) this.eLevelMarkerEl.removeClass('emrald-hidden');
		if (this.greenBarEl) this.greenBarEl.addClass('is-active');
	}

	/**
	 * Start a provisional session (offline start — no server session yet).
	 * Creates a local active session state so controls render immediately.
	 */
	startProvisionalSession(item: TrackedItem, priorMinutesToday: number) {
		this.state.activeSession = {
			sessionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			itemId: item.id,
			itemName: item.name,
			effortLevel: item.effort_level,
			startedAt: new Date(),
			pausedAt: null,
			elapsedMs: 0,
			totalPausedMs: 0,
			priorMinutesToday: priorMinutesToday,
			isPendingSync: true
		};

		this.stopIdleAnimation();
		this.startSessionAnimation();
		this.renderControls();
		this.updateBars();

		if (this.timerEl) this.timerEl.removeClass('emrald-hidden');
		if (this.eLevelMarkerEl) this.eLevelMarkerEl.removeClass('emrald-hidden');
		if (this.greenBarEl) this.greenBarEl.addClass('is-active');
	}

	/**
	 * Serialize active session state for persistence (survives plugin reload).
	 */
	serializeActiveSession(): Record<string, unknown> | null {
		const s = this.state.activeSession;
		if (!s) return null;
		return {
			sessionId: s.sessionId,
			itemId: s.itemId,
			itemName: s.itemName,
			effortLevel: s.effortLevel,
			startedAt: s.startedAt.toISOString(),
			pausedAt: s.pausedAt ? s.pausedAt.toISOString() : null,
			elapsedMs: s.elapsedMs,
			totalPausedMs: s.totalPausedMs,
			priorMinutesToday: s.priorMinutesToday,
			isPendingSync: s.isPendingSync ?? false
		};
	}

	/**
	 * Restore active session state from persisted data.
	 */
	restoreActiveSession(data: Record<string, unknown>) {
		this.state.activeSession = {
			sessionId: data.sessionId as string,
			itemId: data.itemId as string,
			itemName: data.itemName as string,
			effortLevel: data.effortLevel as 'E1' | 'E2' | 'E3' | 'E4',
			startedAt: new Date(data.startedAt as string),
			pausedAt: data.pausedAt ? new Date(data.pausedAt as string) : null,
			elapsedMs: data.elapsedMs as number,
			totalPausedMs: data.totalPausedMs as number,
			priorMinutesToday: data.priorMinutesToday as number,
			isPendingSync: (data.isPendingSync as boolean) ?? false
		};

		this.stopIdleAnimation();
		this.startSessionAnimation();
		this.renderControls();
		this.updateBars();

		if (this.timerEl) this.timerEl.removeClass('emrald-hidden');
		if (this.eLevelMarkerEl) this.eLevelMarkerEl.removeClass('emrald-hidden');
		if (this.greenBarEl) this.greenBarEl.addClass('is-active');
	}
	pauseSession() {
		if (!this.state.activeSession) return;
		this.state.activeSession.pausedAt = new Date();
		this.renderControls();
	}

	/**
	 * Resume the active session.
	 */
	resumeSession() {
		if (!this.state.activeSession || !this.state.activeSession.pausedAt) return;
		// Accumulate pause duration
		this.state.activeSession.totalPausedMs += Date.now() - this.state.activeSession.pausedAt.getTime();
		this.state.activeSession.pausedAt = null;
		this.renderControls();
	}

	/**
	 * Get current session elapsed minutes without stopping.
	 */
	getSessionMinutes(): number {
		if (!this.state.activeSession) return 0;
		return this.state.activeSession.elapsedMs / 60000;
	}

	/**
	 * Stop the active session. Returns elapsed minutes.
	 */
	stopSession(): number {
		if (!this.state.activeSession) return 0;

		const elapsedMinutes = this.state.activeSession.elapsedMs / 60000;

		// Add to today's worked total
		this.state.workedMinutes += elapsedMinutes;
		this.state.activeSession = null;

		this.stopSessionAnimation();
		this.startIdleAnimation();
		this.renderControls();
		this.renderSummary();
		this.updateBars();

		if (this.timerEl) this.timerEl.addClass('emrald-hidden');
		if (this.eLevelMarkerEl) this.eLevelMarkerEl.addClass('emrald-hidden');
		if (this.greenBarEl) this.greenBarEl.removeClass('is-active');

		return elapsedMinutes;
	}

	/**
	 * Close the day.
	 */
	closeDay() {
		this.state.dayIsClosed = true;
		this.stopSessionAnimation();
		this.stopIdleAnimation();
		this.renderControls();
		this.renderSummary();
	}

	/**
	 * Clean up animations.
	 */
	destroy() {
		this.stopIdleAnimation();
		this.stopSessionAnimation();
	}

	// ── Tick Rendering ──────────────────────────────────────

	private renderTicks() {
		if (!this.tickBarEl) return;
		this.tickBarEl.empty();

		// Render 48 ticks (two days) so wide panels never run out past midnight.
		for (let i = 0; i < 48; i++) {
			const h = i % 24;
			const tick = this.tickBarEl.createDiv({ cls: 'emerald-tick' });
			const label = h === 0 ? '12a' : h < 12 ? `${h}` : h === 12 ? '12p' : `${h - 12}`;
			tick.createSpan({ cls: 'emerald-tick-label', text: label });
			tick.dataset.hour = String(i);
		}
	}

	private positionTicks(anchorHour: number) {
		if (!this.tickBarEl) return;

		// Each tick is 50px wide (set in CSS).
		const hourWidth = 50;
		// Left edge = "now". Ticks extend to the right only.
		// Past hours are off-screen to the left; future hours visible to the right.
		// Green bar fills from left edge (now) toward E-level marker.
		const offset = -(anchorHour * hourWidth);

		this.tickBarEl.style.transform = `translateX(${offset}px)`;
	}

	// ── Idle Animation ──────────────────────────────────────

	private startIdleAnimation() {
		if (this.state.dayIsClosed) return;

		const animate = () => {
			const now = new Date();
			const hourFraction = now.getHours() + now.getMinutes() / 60;
			this.positionTicks(hourFraction);
			this.tickAnimationId = window.requestAnimationFrame(animate);
		};

		this.tickAnimationId = window.requestAnimationFrame(animate);
	}

	private stopIdleAnimation() {
		if (this.tickAnimationId !== null) {
			window.cancelAnimationFrame(this.tickAnimationId);
			this.tickAnimationId = null;
		}
	}

	// ── Session Animation ───────────────────────────────────

	private startSessionAnimation() {
		if (!this.state.activeSession) return;

		// Freeze ticks at session start time
		const startTime = this.state.activeSession.startedAt;
		const freezeHour = startTime.getHours() + startTime.getMinutes() / 60;
		this.positionTicks(freezeHour);

		// Calculate E-level marker position
		this.updateELevelMarker();

		// Update every second
		this.sessionIntervalId = window.setInterval(() => {
			this.updateSessionTimer();
			this.updateBars();
			// Only notify parent of elapsed minutes when actively running
			// (not paused) so the project card timer freezes during pauses.
			if (this.state.activeSession && !this.state.activeSession.pausedAt) {
				this.onSessionTick(this.state.activeSession.elapsedMs / 60000);
			}
		}, 1000);
	}

	private stopSessionAnimation() {
		if (this.sessionIntervalId !== null) {
			window.clearInterval(this.sessionIntervalId);
			this.sessionIntervalId = null;
		}
	}

	private updateSessionTimer() {
		const session = this.state.activeSession;
		if (!session) return;

		// Calculate elapsed time (excluding pauses)
		if (!session.pausedAt) {
			const totalWallTime = Date.now() - session.startedAt.getTime();
			session.elapsedMs = totalWallTime - session.totalPausedMs;
		}
		// If paused, elapsedMs stays frozen at its last value

		// Update timer display
		if (this.timerEl) {
			const totalSec = Math.floor(session.elapsedMs / 1000);
			const h = Math.floor(totalSec / 3600);
			const m = Math.floor((totalSec % 3600) / 60);
			const s = totalSec % 60;
			const pad = (n: number) => String(n).padStart(2, '0');
			const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;

			this.timerEl.empty();
			const dot = this.timerEl.createSpan({ cls: 'emerald-timer-dot is-recording' });
			dot.setAttribute('aria-hidden', 'true');
			this.timerEl.createSpan({ cls: 'emerald-timer-text', text: timeStr });
			this.timerEl.setAttribute('role', 'timer');
			this.timerEl.setAttribute('aria-label', `Session elapsed: ${timeStr}`);
		}
	}

	// ── Bar Updates ─────────────────────────────────────────

	private updateBars() {
		const totalAvailableMin = this.state.availableHours * 60;
		if (totalAvailableMin <= 0) return;

		// Calculate total worked including current session
		let totalWorkedMin = this.state.workedMinutes;
		if (this.state.activeSession) {
			totalWorkedMin += this.state.activeSession.elapsedMs / 60000;
		}

		// Green bar: pixel width (same coord system as ticks — hours * 50px)
		const hourWidth = 50;
		const greenPx = (totalWorkedMin / 60) * hourWidth;
		if (this.greenBarEl) {
			this.greenBarEl.style.width = `${greenPx}px`;
		}

		// Overtime bar: extends beyond daily hours in pixels
		if (totalWorkedMin > totalAvailableMin && this.overtimeBarEl) {
			const overtimeMin = totalWorkedMin - totalAvailableMin;
			const overtimePx = (overtimeMin / 60) * hourWidth;
			this.overtimeBarEl.style.width = `${overtimePx}px`;
			this.overtimeBarEl.style.left = `${greenPx}px`;
			this.overtimeBarEl.removeClass('emrald-hidden');

			// Add/update overtime counter text
			let counterEl = this.overtimeBarEl.querySelector('.emerald-overtime-counter');
			if (!counterEl) {
				counterEl = this.overtimeBarEl.createSpan({ cls: 'emerald-overtime-counter' });
			}
			const otH = Math.floor(overtimeMin / 60);
			const otM = Math.round(overtimeMin % 60);
			counterEl.textContent = otH > 0 ? `+${otH}h${otM}m` : `+${otM}m`;
		} else if (this.overtimeBarEl) {
			this.overtimeBarEl.addClass('emrald-hidden');
		}
	}

	updateELevelMarker() {
		const session = this.state.activeSession;
		if (!session || !this.eLevelMarkerEl) return;

		const totalAvailableMin = this.state.availableHours * 60;
		const prescribedMin = totalAvailableMin * (E_LEVEL_PERCENT[session.effortLevel] ?? 0.5);

		// Remaining prescribed time = prescribed - already worked on this project today
		const remainingMin = Math.max(prescribedMin - session.priorMinutesToday, 0);

		// Position marker in pixels (same coordinate system as tick marks).
		// Each hour = 50px. The marker sits at a fixed time distance from "now" (left edge),
		// so it moves with the ticks on resize — not as a percentage of bar width.
		const hourWidth = 50; // Must match tick CSS width
		const currentWorkedMin = this.state.workedMinutes + session.priorMinutesToday;
		const markerMin = currentWorkedMin + remainingMin;
		const markerHours = markerMin / 60;
		const markerPx = markerHours * hourWidth;

		this.eLevelMarkerEl.style.left = `${markerPx}px`;
		this.eLevelMarkerEl.removeClass('emrald-hidden');
		this.eLevelMarkerEl.textContent = session.effortLevel;
		this.eLevelMarkerEl.dataset.level = session.effortLevel;
		this.eLevelMarkerEl.addClass('is-active');
	}

	/**
	 * Position the Daily Hours end marker.
	 * Shows where the user's allotted daily hours end on the timebar.
	 */
	updateDailyHoursMarker() {
		if (!this.dailyHoursMarkerEl) return;

		const hourWidth = 50;
		const dhPx = this.state.availableHours * hourWidth;

		this.dailyHoursMarkerEl.style.left = `${dhPx}px`;
		this.dailyHoursMarkerEl.textContent = `${this.state.availableHours}h`;
	}

	/**
	 * Check if the active project has met its prescribed effort.
	 */
	hasMetPrescribedEffort(): boolean {
		const session = this.state.activeSession;
		if (!session) return false;

		const totalAvailableMin = this.state.availableHours * 60;
		const prescribedMin = totalAvailableMin * (E_LEVEL_PERCENT[session.effortLevel] ?? 0.5);
		const totalProjectMin = session.priorMinutesToday + (session.elapsedMs / 60000);

		return totalProjectMin >= prescribedMin;
	}

	// ── Controls ────────────────────────────────────────────

	renderControls() {
		if (!this.controlsEl) return;
		this.controlsEl.empty();

		if (this.state.dayIsClosed) {
			this.controlsEl.createDiv({
				cls: 'emerald-day-closed',
				text: 'Day closed ✓'
			});
			return;
		}

		if (this.state.activeSession) {
			// Pending sync indicator for offline-started sessions
			if (this.state.activeSession.isPendingSync) {
				const syncBadge = this.controlsEl.createDiv({
					cls: 'emerald-pending-sync-badge',
					text: '⚡ Pending sync — tracking locally'
				});
				syncBadge.setAttribute('role', 'status');
			}

			// Active session controls
			if (this.state.activeSession.pausedAt) {
				// Paused
				const resumeBtn = this.controlsEl.createEl('button', {
					cls: 'emerald-btn emerald-btn-primary',
					text: 'Resume'
				});
				resumeBtn.setAttribute('aria-label', 'Resume session');
				const resumeIcon = createIconEl(resumeBtn, ICONS.play, 'emerald-btn-icon');
				resumeIcon.setAttribute('aria-hidden', 'true');
				resumeBtn.addEventListener('click', () => this.onResume());

				const stopBtn = this.controlsEl.createEl('button', {
					cls: 'emerald-btn emerald-btn-danger',
					text: 'Stop'
				});
				stopBtn.setAttribute('aria-label', 'Stop session');
				const stopIcon = createIconEl(stopBtn, ICONS.square, 'emerald-btn-icon');
				stopIcon.setAttribute('aria-hidden', 'true');
				stopBtn.addEventListener('click', () => this.onStop());
			} else {
				// Running
				const pauseBtn = this.controlsEl.createEl('button', {
					cls: 'emerald-btn emerald-btn-secondary',
					text: 'Pause'
				});
				pauseBtn.setAttribute('aria-label', 'Pause session');
				const pauseIcon = createIconEl(pauseBtn, ICONS.pause, 'emerald-btn-icon');
				pauseIcon.setAttribute('aria-hidden', 'true');
				pauseBtn.addEventListener('click', () => this.onPause());

				const stopBtn = this.controlsEl.createEl('button', {
					cls: 'emerald-btn emerald-btn-danger',
					text: 'Stop'
				});
				stopBtn.setAttribute('aria-label', 'Stop session');
				const stopIcon2 = createIconEl(stopBtn, ICONS.square, 'emerald-btn-icon');
				stopIcon2.setAttribute('aria-hidden', 'true');
				stopBtn.addEventListener('click', () => this.onStop());
			}

		} else {
			// Idle controls — Start Session button
			const startBtn = this.controlsEl.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Start session'
			});
			startBtn.setAttribute('aria-label', 'Start a new session');
			const startIcon = createIconEl(startBtn, ICONS.play, 'emerald-btn-icon');
			startIcon.setAttribute('aria-hidden', 'true');
			startBtn.addEventListener('click', () => this.onStartRequest());
		}
	}

	// ── Summary ─────────────────────────────────────────────

	private renderSummary() {
		if (!this.summaryEl) return;
		this.summaryEl.empty();

		const totalAvailableMin = this.state.availableHours * 60;
		let totalWorkedMin = this.state.workedMinutes;
		if (this.state.activeSession) {
			totalWorkedMin += this.state.activeSession.elapsedMs / 60000;
		}

		const workedH = Math.floor(totalWorkedMin / 60);
		const workedM = Math.round(totalWorkedMin % 60);
		const workedStr = workedM > 0 ? `${workedH}h ${workedM}m` : `${workedH}h`;

		// Available hours (tappable for override)
		const availEl = this.summaryEl.createDiv({ cls: 'emerald-available' });
		const availText = this.state.availableHours > 0
			? `Daily hours: ${this.state.availableHours}h`
			: 'Set your daily hours';
		availEl.createSpan({
			cls: 'emerald-available-text',
			text: availText
		});
		availEl.addEventListener('click', () => this.onHourOverride());

		// Bar label — "Today: Xh Xm / Yh worked" below the timeblock bar
		if (this.barLabelEl) {
			this.barLabelEl.empty();
			const availStr = this.state.availableHours > 0 ? ` / ${this.state.availableHours}h` : '';
			this.barLabelEl.createSpan({ text: `Today: ${workedStr}${availStr} worked` });

			// Overtime indicator
			if (totalWorkedMin > totalAvailableMin && totalAvailableMin > 0) {
				const overtimeMin = Math.round(totalWorkedMin - totalAvailableMin);
				const otH = Math.floor(overtimeMin / 60);
				const otM = overtimeMin % 60;
				this.barLabelEl.createSpan({
					cls: 'emerald-overtime-label',
					text: ` +${otH > 0 ? otH + 'h ' : ''}${otM}m overtime`
				});
			}
		}

		// Close Day button (only in idle state, not already closed)
		if (!this.state.activeSession && !this.state.dayIsClosed && totalWorkedMin > 0) {
			const closeBtn = this.summaryEl.createEl('button', {
				cls: 'emerald-btn emerald-btn-subtle',
				text: 'Close day ✓'
			});
			closeBtn.addEventListener('click', () => this.onCloseDay());
		}
	}

	// ── Event Handlers (to be wired by parent view) ─────────

	// These are stubs — the sidebar view will override them
	onStartRequest: () => void = () => {};
	onPause: () => void = () => {};
	onResume: () => void = () => {};
	onStop: () => void = () => {};
	onCloseDay: () => void = () => {};
	onHourOverride: () => void = () => {};
	onSessionTick: (elapsedMin: number) => void = () => {};
}
