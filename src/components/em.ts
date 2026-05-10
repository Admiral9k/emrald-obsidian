// EMRALD EM Section Component
// Displays: energy check-in banner (if not submitted today), pinned sparklines
// with real 14-day history data, rotating insights, and workspace view buttons.

import { Notice } from 'obsidian';
import EmraldPlugin from '../../main';
import { ComputedMetric, ComputedMetricHistory, AIInsight } from '../api/client';
import { createIconEl, ICONS } from '../utils/icons';
import { tierState } from '../tier';
import {
	VIEW_ELEVEL_OVERVIEW, VIEW_INSIGHT_LOG, VIEW_DATA_CENTER,
	VIEW_EFFORT_PROFILE, VIEW_BURNOUT_MONITOR, VIEW_DIGEST, VIEW_ABOUT
} from '../views/workspace-views';

// SVG sparkline dimensions
const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 20;
const SPARK_DOT_RADIUS = 2;
const SPARK_STROKE_WIDTH = 1.5;

export class EMComponent {
	private plugin: EmraldPlugin;
	private containerEl: HTMLElement;
	private pinnedMetricsListener?: () => void;
	private insightAckListener?: () => void;
	private get pinnedMetrics(): string[] {
		return this.plugin.settings?.pinnedMetricKeys ?? ['D1', 'D8', 'D12', 'D3'];
	}
	private insights: AIInsight[] = [];
	private currentInsightIndex: number = 0;
	private checkinDone: boolean = false;

	// DOM refs for targeted updates
	private checkinBannerEl: HTMLElement | null = null;
	private sparklinesEl: HTMLElement | null = null;
	private insightEl: HTMLElement | null = null;

	constructor(plugin: EmraldPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		this.containerEl = containerEl;
	}

	destroy() {
		this.stopInsightRotation();
		if (this.pinnedMetricsListener) {
			window.removeEventListener('emrald:pinned-metrics-changed', this.pinnedMetricsListener as EventListener);
			this.pinnedMetricsListener = undefined;
		}
		if (this.insightAckListener) {
			window.removeEventListener('emrald:insight-acknowledged', this.insightAckListener as EventListener);
			this.insightAckListener = undefined;
		}
	}

	render() {
		this.containerEl.empty();
		this.containerEl.addClass('emerald-em-content');

		// Energy check-in banner (placeholder — filled by loadData)
		this.checkinBannerEl = this.containerEl.createEl('div', { cls: 'emerald-checkin-banner' });
		this.checkinBannerEl.style.display = 'none';

		// Sparklines (Pro only — Pinned Metrics)
		if (tierState.isPro()) {
			this.sparklinesEl = this.containerEl.createEl('div', { cls: 'emerald-sparklines' });
			this.sparklinesEl.createEl('div', { cls: 'emerald-sparklines-title', text: 'Pinned Metrics' });
			this.renderSparklinePlaceholders();
		} else {
			this.sparklinesEl = null;
		}

		// Insight bulletin (Pro only)
		if (tierState.isPro()) {
			this.insightEl = this.containerEl.createEl('div', { cls: 'emerald-insight-bulletin' });
			this.insightEl.createEl('div', { cls: 'emerald-insight-empty', text: 'Loading insights...' });
		} else {
			this.insightEl = null;
		}

		// Workspace buttons
		this.renderWorkspaceButtons();

		// Upgrade card (free users only)
		if (tierState.isFree()) {
			this.renderUpgradeCard();
		}

		// Listen for live pin changes from Data Center
		if (this.pinnedMetricsListener) {
			window.removeEventListener('emrald:pinned-metrics-changed', this.pinnedMetricsListener as EventListener);
		}
		this.pinnedMetricsListener = () => this.render();
		window.addEventListener('emrald:pinned-metrics-changed', this.pinnedMetricsListener as EventListener);

		// Listen for insight acknowledgement from Insight Log workspace view
		if (this.insightAckListener) {
			window.removeEventListener('emrald:insight-acknowledged', this.insightAckListener as EventListener);
		}
		this.insightAckListener = () => {
			// Reload insights from API to sync state, then re-render bulletin + badge
			this.loadData();
		};
		window.addEventListener('emrald:insight-acknowledged', this.insightAckListener as EventListener);

		// Load real data
		this.loadData();
	}

	// ── Energy Check-in Banner ──────────────────────────────

	private renderCheckinBanner() {
		if (!this.checkinBannerEl) return;
		this.checkinBannerEl.empty();

		if (this.checkinDone) {
			this.checkinBannerEl.style.display = 'none';
			return;
		}

		this.checkinBannerEl.style.display = 'block';

		const inner = this.checkinBannerEl.createEl('div', { cls: 'emerald-checkin-inner' });
		createIconEl(inner, ICONS.sun, 'emerald-checkin-icon');
		const textCol = inner.createEl('div', { cls: 'emerald-checkin-text' });
		textCol.createEl('div', { cls: 'emerald-checkin-title', text: 'Daily Check-in' });
		textCol.createEl('div', { cls: 'emerald-checkin-desc', text: 'How are you feeling today?' });

		const btn = inner.createEl('button', { cls: 'emerald-btn emerald-btn-primary emerald-checkin-btn', text: 'Check in' });
		btn.setAttribute('aria-label', 'Open daily energy check-in');
		btn.addEventListener('click', async () => {
			const { EnergyCheckinModal } = await import('../modals/energy-checkin');
			const modal = new EnergyCheckinModal(
				this.plugin.app,
				this.plugin,
				async (checkin) => {
					const resp = await this.plugin.apiClient.submitEnergyCheckin(checkin);
					if (resp.queued) {
						this.checkinDone = true;
						this.renderCheckinBanner();
						new Notice('Energy check-in queued — will sync when online');
					} else if (!resp.error) {
						this.checkinDone = true;
						this.renderCheckinBanner();
						new Notice('Energy check-in recorded ✓');
					} else {
						new Notice(`Check-in failed: ${resp.error}`);
					}
				}
			);
			modal.open();
		});
	}

	// ── Sparklines ──────────────────────────────────────────

	private renderSparklinePlaceholders() {
		if (!this.sparklinesEl) return;

		// Remove old rows (keep title)
		const title = this.sparklinesEl.querySelector('.emerald-sparklines-title');
		this.sparklinesEl.empty();
		if (title) this.sparklinesEl.appendChild(title);

		for (const key of this.pinnedMetrics) {
			const row = this.sparklinesEl.createEl('div', { cls: 'emerald-sparkline-row' });
			row.dataset.metricKey = key;
			row.createEl('span', { cls: 'emerald-sparkline-key', text: key });
			row.createEl('span', { cls: 'emerald-sparkline-graph', text: '·······' });
			row.createEl('span', { cls: 'emerald-sparkline-value', text: '—' });
		}
	}

	private async loadSparklineData() {
		if (!this.sparklinesEl) return;

		for (const key of this.pinnedMetrics) {
			const row = this.sparklinesEl.querySelector(`[data-metric-key="${key}"]`);
			if (!row) continue;

			const histResp = await this.plugin.apiClient.getMetricHistory(key);
			const graphEl = row.querySelector('.emerald-sparkline-graph');
			const valueEl = row.querySelector('.emerald-sparkline-value');
			const normalized = this.normalizeHistory(histResp.data ?? []).slice(-14);

			if (normalized.length > 0) {
				const values = normalized.map(h => h.value ?? 0);

				if (graphEl) {
					graphEl.textContent = '';
					graphEl.appendChild(this.buildSparklineSVG(values));
				}

				if (valueEl) {
					const latest = normalized[normalized.length - 1];
					valueEl.textContent = latest.value !== null ? latest.value.toFixed(1) : '—';
				}
			} else {
				if (graphEl) {
					graphEl.textContent = '';
					graphEl.appendChild(this.buildSparklineSVG([]));
				}
				const currentResp = await this.plugin.apiClient.getMetrics([key]);
				if (currentResp.data && currentResp.data.length > 0 && valueEl) {
					const m = currentResp.data[0];
					valueEl.textContent = m.value !== null ? m.value.toFixed(1) : '—';
				}
			}
		}
	}

	private normalizeHistory(history: ComputedMetricHistory[]): ComputedMetricHistory[] {
		const byDate = new Map<string, ComputedMetricHistory>();

		for (const entry of history) {
			const dateKey = entry.computed_at.split('T')[0];
			const existing = byDate.get(dateKey);
			if (!existing) {
				byDate.set(dateKey, entry);
				continue;
			}

			const existingVal = existing.value ?? 0;
			const candidateVal = entry.value ?? 0;
			const existingMeaningful = existing.value !== null && existingVal !== 0;
			const candidateMeaningful = entry.value !== null && candidateVal !== 0;

			if (candidateMeaningful && !existingMeaningful) {
				byDate.set(dateKey, entry);
				continue;
			}

			if (candidateMeaningful === existingMeaningful && entry.computed_at > existing.computed_at) {
				byDate.set(dateKey, entry);
			}
		}

		return Array.from(byDate.values()).sort((a, b) => a.computed_at.localeCompare(b.computed_at));
	}

	/**
	 * Build an SVG sparkline element from an array of values.
	 * Returns an <svg> element with a polyline and endpoint dot.
	 */
	private buildSparklineSVG(values: number[]): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', String(SPARK_WIDTH));
		svg.setAttribute('height', String(SPARK_HEIGHT));
		svg.setAttribute('viewBox', `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`);
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-hidden', 'true');
		svg.classList.add('emerald-sparkline-svg');

		// No data — render a flat dashed line at midpoint
		if (values.length === 0) {
			const midY = SPARK_HEIGHT / 2;
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', '0');
			line.setAttribute('y1', String(midY));
			line.setAttribute('x2', String(SPARK_WIDTH));
			line.setAttribute('y2', String(midY));
			line.classList.add('emerald-sparkline-line-empty');
			svg.appendChild(line);
			return svg;
		}

		// Single value — render a dot at center
		if (values.length === 1) {
			const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			dot.setAttribute('cx', String(SPARK_WIDTH / 2));
			dot.setAttribute('cy', String(SPARK_HEIGHT / 2));
			dot.setAttribute('r', String(SPARK_DOT_RADIUS + 0.5));
			dot.classList.add('emerald-sparkline-dot');
			svg.appendChild(dot);
			return svg;
		}

		const min = Math.min(...values);
		const max = Math.max(...values);
		const range = max - min;
		const padding = 2; // vertical padding so line doesn't clip edges

		// Build points — evenly spaced across width
		const points: string[] = [];
		const step = SPARK_WIDTH / (values.length - 1);

		for (let i = 0; i < values.length; i++) {
			const x = i * step;
			let y: number;
			if (range === 0) {
				y = SPARK_HEIGHT / 2; // flat line
			} else {
				const normalized = (values[i] - min) / range;
				y = (SPARK_HEIGHT - padding) - normalized * (SPARK_HEIGHT - padding * 2);
			}
			points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
		}

		// Polyline for the sparkline path
		const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		polyline.setAttribute('points', points.join(' '));
		polyline.classList.add('emerald-sparkline-line');
		svg.appendChild(polyline);

		// Endpoint dot on the most recent value (last point)
		const lastPoint = points[points.length - 1].split(',');
		const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		dot.setAttribute('cx', lastPoint[0]);
		dot.setAttribute('cy', lastPoint[1]);
		dot.setAttribute('r', String(SPARK_DOT_RADIUS));
		dot.classList.add('emerald-sparkline-dot');
		svg.appendChild(dot);

		return svg;
	}

	// ── Insight Bulletin ────────────────────────────────────

	private renderInsightBulletin() {
		if (!this.insightEl) return;
		this.insightEl.empty();

		const unread = this.insights.filter(i => !i.acknowledged_at);

		if (unread.length === 0) {
			this.insightEl.createEl('div', { cls: 'emerald-insight-empty', text: 'No insights yet. Keep working!' });
			return;
		}

		// Container with visual distinction
		const container = this.insightEl.createEl('div', { cls: 'emerald-insight-container' });

		// Header
		container.createEl('div', { cls: 'emerald-insight-header', text: 'Latest Insights' });

		// Clamp index
		this.currentInsightIndex = Math.min(this.currentInsightIndex, Math.max(unread.length - 1, 0));
		if (this.currentInsightIndex < 0) this.currentInsightIndex = 0;

		const insight = unread[this.currentInsightIndex];
		container.createEl('div', { cls: 'emerald-insight-title', text: insight.title });
		container.createEl('div', { cls: 'emerald-insight-body', text: insight.body });

		// Pagination dots
		if (unread.length > 1) {
			const dots = container.createEl('div', { cls: 'emerald-insight-dots' });
			for (let i = 0; i < unread.length; i++) {
				const dot = dots.createEl('span', { cls: 'emerald-insight-dot' });
				if (i === this.currentInsightIndex) dot.addClass('is-active');
				const idx = i; // capture for closure
				dot.addEventListener('click', () => {
					this.currentInsightIndex = idx;
					this.stopInsightRotation();
					this.renderInsightBulletin();
				});
			}
		}

		// Actions
		const actions = container.createEl('div', { cls: 'emerald-insight-actions' });
		const gotItBtn = actions.createEl('button', { cls: 'emerald-btn-tiny', text: 'Got it' });
		gotItBtn.setAttribute('aria-label', 'Dismiss insight');
		gotItBtn.addEventListener('click', () => this.acknowledgeInsight(insight.id, 'dismissed'));

		// Start auto-rotation
		this.startInsightRotation();
	}

	private insightRotationTimer: ReturnType<typeof setInterval> | null = null;

	private startInsightRotation() {
		this.stopInsightRotation();
		if (this.insights.length <= 1) return;

		this.insightRotationTimer = setInterval(() => {
			this.currentInsightIndex = (this.currentInsightIndex + 1) % this.insights.length;
			this.renderInsightBulletin();
		}, (this.plugin.settings?.insightRotationSeconds ?? 15) * 1000);
	}

	private stopInsightRotation() {
		if (this.insightRotationTimer) {
			clearInterval(this.insightRotationTimer);
			this.insightRotationTimer = null;
		}
	}

	// ── Workspace Buttons ───────────────────────────────────

	/** Views that require Pro tier */
	private static PRO_VIEWS = new Set([VIEW_INSIGHT_LOG, VIEW_DATA_CENTER]);

	private renderWorkspaceButtons() {
		const section = this.containerEl.createEl('div', { cls: 'emerald-workspace-buttons' });
		section.createEl('div', { cls: 'emerald-workspace-title', text: 'Workspace Views' });

		const buttons = [
			{ icon: ICONS.barChart, label: 'E-Level Overview', view: VIEW_ELEVEL_OVERVIEW },
			{ icon: ICONS.lightbulb, label: 'Insight Log', view: VIEW_INSIGHT_LOG, badge: this.insights.filter(i => !i.acknowledged_at).length },
			{ icon: ICONS.trendingUp, label: 'Data Center', view: VIEW_DATA_CENTER },
			{ icon: ICONS.user, label: 'Effort Profile', view: VIEW_EFFORT_PROFILE },
			{ icon: ICONS.flame, label: 'Burnout Monitor', view: VIEW_BURNOUT_MONITOR },
			{ icon: ICONS.clipboardList, label: 'Digest', view: VIEW_DIGEST },
			{ icon: ICONS.gem, label: 'About EMRALD', view: VIEW_ABOUT }
		];

		for (const btn of buttons) {
			const row = section.createEl('div', { cls: 'emerald-workspace-btn' });
			row.setAttribute('role', 'button');
			row.setAttribute('aria-label', btn.label + (btn.badge && btn.badge > 0 ? ` (${btn.badge} unread)` : ''));
			row.tabIndex = 0;
			const rowContent = row.createEl('span', { cls: 'emerald-workspace-btn-label' });
			const iconEl = createIconEl(rowContent, btn.icon, 'emerald-workspace-btn-icon');
			iconEl.setAttribute('aria-hidden', 'true');
			rowContent.createEl('span', { text: btn.label });

			// Unread badge — inline with label so it doesn't push PRO pill
			if (btn.badge && btn.badge > 0) {
				const badgeEl = rowContent.createEl('span', { cls: 'emerald-badge', text: String(btn.badge) });
				badgeEl.setAttribute('aria-hidden', 'true');
			}

			// PRO pill badge for gated views
			if (EMComponent.PRO_VIEWS.has(btn.view)) {
				row.createEl('span', { cls: 'emerald-pro-pill', text: 'PRO' });
			}

			row.addEventListener('click', () => this.openWorkspaceView(btn.view));
			row.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.openWorkspaceView(btn.view);
				}
			});
		}

		// Early access feedback footer (hidden at v1.0.0+)
		const version = this.plugin.manifest.version ?? '0.0.0';
		const major = parseInt(version.split('.')[0] ?? '0');
		if (major < 1) {
			const footer = section.createEl('div', { cls: 'emerald-feedback-footer' });
			const link = footer.createEl('a', {
				cls: 'emerald-feedback-link',
				text: '🟢 Early Access · Send Feedback',
				href: 'mailto:feedback@effortmastery.com?subject=EMRALD%20Feedback'
			});
			link.addEventListener('click', (e) => {
				e.preventDefault();
				window.open('mailto:feedback@effortmastery.com?subject=EMRALD%20Feedback', '_blank');
			});
		}
	}

	// ── Upgrade Card (sidebar, free users only) ─────────────

	private renderUpgradeCard() {
		const card = this.containerEl.createEl('div', { cls: 'emerald-sidebar-upgrade-card' });

		const headerRow = card.createEl('div', { cls: 'emerald-upgrade-header' });
		const upgradeIcon = createIconEl(headerRow, 'sparkles', 'emerald-upgrade-icon-svg');
		upgradeIcon.setAttribute('aria-hidden', 'true');
		headerRow.createEl('span', { cls: 'emerald-upgrade-title', text: 'Unlock Full Intelligence' });

		card.createEl('p', {
			cls: 'emerald-upgrade-desc',
			text: 'Pinned metrics, AI insights, daily digests, and advanced analytics — all with Pro.'
		});

		const btn = card.createEl('a', {
			cls: 'emerald-btn emerald-btn-upgrade',
			text: 'Upgrade to Pro',
			href: 'https://app.effortmastery.com/app/billing'
		});
		btn.setAttribute('target', '_blank');
		btn.setAttribute('rel', 'noopener noreferrer');
	}

	// ── Data Loading ────────────────────────────────────────

	private async loadData() {
		// Check if energy check-in was submitted today
		try {
			const checkinResp = await this.plugin.apiClient.getTodayCheckin();
			this.checkinDone = !!(checkinResp.data);
		} catch {
			this.checkinDone = false;
		}
		this.renderCheckinBanner();

		// Load sparkline history data (Pro only — Pinned Metrics)
		if (tierState.isPro()) {
			try {
				await this.loadSparklineData();
			} catch {
				// Sparklines stay as placeholders
			}
		}

		// Load insights (Pro only — Insight Bulletin)
		if (tierState.isPro()) {
			try {
				const insightsResp = await this.plugin.apiClient.getInsights(5);
				if (insightsResp.data) {
					this.insights = insightsResp.data;
				}
			} catch {
				// Insights stay empty
			}
			this.renderInsightBulletin();
		}

		// Re-render workspace buttons (badge count may have changed)
		const wsSection = this.containerEl.querySelector('.emerald-workspace-buttons');
		if (wsSection) wsSection.remove();
		// Also remove old upgrade card before re-render
		const oldUpgrade = this.containerEl.querySelector('.emerald-sidebar-upgrade-card');
		if (oldUpgrade) oldUpgrade.remove();

		this.renderWorkspaceButtons();

		// Re-render upgrade card if still free
		if (tierState.isFree()) {
			this.renderUpgradeCard();
		}
	}

	// ── Actions ─────────────────────────────────────────────

	private async acknowledgeInsight(id: string, action: 'dismissed' | 'acted') {
		const resp = await this.plugin.apiClient.acknowledgeInsight(id, action);
		if (!resp.error) {
			this.insights = this.insights.map(i => i.id === id
				? { ...i, acknowledged_at: new Date().toISOString(), action_taken: action }
				: i
			);
			this.currentInsightIndex = Math.min(this.currentInsightIndex, Math.max(this.insights.length - 1, 0));
			this.renderInsightBulletin();

			const wsSection = this.containerEl.querySelector('.emerald-workspace-buttons');
			if (wsSection) wsSection.remove();
			this.renderWorkspaceButtons();
			if (tierState.isFree()) {
				const oldUpgrade = this.containerEl.querySelector('.emerald-sidebar-upgrade-card');
				if (oldUpgrade) oldUpgrade.remove();
				this.renderUpgradeCard();
			}

			new Notice('Insight acknowledged');
			// Notify Insight Log workspace view to refresh if open
			window.dispatchEvent(new CustomEvent('emrald:insight-acknowledged', { detail: { id } }));
		}
	}

	private openWorkspaceView(viewType: string) {
		this.plugin.openWorkspaceView(viewType);
	}
}
