// EMRALD Digest View — Weekly and monthly summary reports.
// Shows: latest digest content, browsable history by period.
// Obsidian-native: uses var() theme colors, clean typography, no flashy UI.

import { WorkspaceLeaf, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_DIGEST, VIEW_DATA_CENTER } from './base';
import { Digest, DigestContent } from '../../api/client';
import { tierState } from '../../tier';

const PERIOD_ICONS: Record<string, string> = {
	daily: 'calendar',
	weekly: 'calendar-range',
	monthly: 'calendar-check'
};

export class DigestView extends EmraldWorkspaceView {
	private allDigests: Digest[] = [];
	private selectedIndex: number = 0;
	private filterPeriod: string = 'all';
	private contentContainer: Element | null = null;
	private navContainer: Element | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'Digest');
	}

	getViewType(): string { return VIEW_DIGEST; }
	getIcon(): string { return 'clipboard-list'; }

	async onOpen() {
		const container = this.getContainer();
		this.renderHeader(container, 'Digest', 'Your effort story, summarized', 'clipboard-list');

		let resp;
		try {
			resp = await this.plugin.apiClient.getDigests();
		} catch {
			this.renderError(container, 'Could not load digests — check your connection.');
			return;
		}

		if (!resp.data || resp.data.length === 0) {
			// Distinguish offline from genuinely empty (P15 fix)
			if (resp.data === null && (resp.status === 0 || resp.error)) {
				this.renderError(container, 'Offline — digests will load when you reconnect.');
			} else {
				this.renderEmptyState(container);
			}
			this.renderDataCenterLink(container);
			return;
		}

		// Stale data banner when showing cached data offline (P15 fix)
		if (resp.fromCache || this.isOffline()) {
			this.renderStaleBanner(container);
		}

		this.allDigests = resp.data;
		this.selectedIndex = 0;

		// Period type filter (All / Daily / Weekly / Monthly)
		// Free users default to 'weekly' only; Pro users see 'all'
		this.filterPeriod = tierState.isPro() ? 'all' : 'weekly';
		this.renderPeriodFilter(container);

		// Navigation (← Older / period label / Newer →)
		this.navContainer = container.createDiv({ cls: 'emerald-wv-digest-nav' });
		this.updateNav();

		// Content area
		this.contentContainer = container.createDiv({ cls: 'emerald-wv-digest-content' });
		this.renderDigest(this.filteredDigests()[0]);

		// Cross-link to Data Center
		this.renderDataCenterLink(container);
	}

	private renderDataCenterLink(container: Element) {
		const link = container.createDiv({ cls: 'emerald-wv-cross-link' });
		const anchor = link.createEl('a', {
			cls: 'emerald-wv-cross-link-text',
			text: 'Explore your metrics \u2192'
		});
		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			void this.plugin.openWorkspaceView(VIEW_DATA_CENTER);
		});
	}

	// ── Empty State ─────────────────────────────────────

	private renderEmptyState(container: Element) {
		const empty = container.createDiv({ cls: 'emerald-wv-empty-state' });

		const iconEl = empty.createDiv({ cls: 'emerald-wv-empty-icon' });
		setIcon(iconEl, 'clipboard-list');

		empty.createEl('h3', { text: 'No digests yet' });
		empty.createEl('p', {
			cls: 'emerald-wv-empty-desc',
			text: 'EMRALD generates weekly and monthly summaries automatically as you work. Complete a few sessions and your first digest will appear here.'
		});

		const checklist = empty.createDiv({ cls: 'emerald-wv-empty-checklist' });
		checklist.createDiv({ cls: 'emerald-wv-empty-check', text: '• Complete at least 3 work sessions' });
		checklist.createDiv({ cls: 'emerald-wv-empty-check', text: '• Fill out effort receipts after each session' });
		checklist.createDiv({ cls: 'emerald-wv-empty-check', text: '• Wait for the weekly summary cycle' });
	}

	// ── Period Filter ───────────────────────────────────

		private renderPeriodFilter(container: Element) {
		const bar = container.createDiv({ cls: 'emerald-wv-filter-bar' });
		const isPro = tierState.isPro();

		for (const period of ['all', 'daily', 'weekly', 'monthly']) {
			const label = period === 'all' ? 'All' : period.charAt(0).toUpperCase() + period.slice(1);
			const btn = bar.createEl('button', {
				cls: `emerald-wv-filter-btn ${period === this.filterPeriod ? 'is-active' : ''}`,
				text: label
			});

			// Free users: daily/monthly are Pro-only — show lock tooltip, don't switch
			if (!isPro && (period === 'daily' || period === 'monthly')) {
				btn.addClass('is-locked');
				btn.title = 'Daily and monthly digests require EMRALD PRO';
				btn.addEventListener('click', () => {
					if (this.contentContainer) {
						this.contentContainer.empty();
						this.renderUpgradeGate(this.contentContainer, {
							icon: 'lock',
							title: period.charAt(0).toUpperCase() + period.slice(1) + ' Digest',
							description: 'Daily and monthly digests are available with EMRALD Pro.',
						});
					}
				});
				continue;
			}

			btn.addEventListener('click', () => {
				this.filterPeriod = period;
				bar.querySelectorAll('.emerald-wv-filter-btn').forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
				this.selectedIndex = 0;
				this.updateNav();
				const filtered = this.filteredDigests();
				if (filtered.length > 0) {
					this.renderDigest(filtered[0]);
				} else if (this.contentContainer) {
					this.contentContainer.empty();
					this.renderPlaceholder(this.contentContainer, `No ${period} digests yet.`);
				}
			});
		}
	}

	private filteredDigests(): Digest[] {
		if (this.filterPeriod === 'all') {
			// Free users only see weekly digests even in 'all' view
			if (!tierState.isPro()) return this.allDigests.filter(d => d.period_type === 'weekly');
			return this.allDigests;
		}
		return this.allDigests.filter(d => d.period_type === this.filterPeriod);
	}

	// ── Navigation ──────────────────────────────────────

	private updateNav() {
		if (!this.navContainer) return;
		this.navContainer.empty();

		const filtered = this.filteredDigests();
		if (filtered.length === 0) return;

		const prevBtn = this.navContainer.createEl('button', {
			cls: `emerald-btn emerald-btn-subtle ${this.selectedIndex >= filtered.length - 1 ? 'is-disabled' : ''}`,
			text: '← older'
		});

		const digest = filtered[this.selectedIndex];
		const periodIcon = this.navContainer.createSpan({ cls: 'emerald-wv-digest-period-label' });

		const iconSpan = periodIcon.createSpan({ cls: 'emerald-wv-digest-period-icon' });
		setIcon(iconSpan, PERIOD_ICONS[digest.period_type] ?? 'calendar');

		const startDate = this.formatDateShort(digest.period_start);
		const endDate = this.formatDateShort(digest.period_end);
		periodIcon.createSpan({
			text: `${this.formatPeriodType(digest.period_type)}: ${startDate} – ${endDate}`
		});

		// Counter
		periodIcon.createSpan({
			cls: 'emerald-wv-digest-counter',
			text: ` (${this.selectedIndex + 1} of ${filtered.length})`
		});

		const nextBtn = this.navContainer.createEl('button', {
			cls: `emerald-btn emerald-btn-subtle ${this.selectedIndex <= 0 ? 'is-disabled' : ''}`,
			text: 'Newer →'
		});

		prevBtn.addEventListener('click', () => {
			if (this.selectedIndex < filtered.length - 1) {
				this.selectedIndex++;
				this.updateNav();
				this.renderDigest(filtered[this.selectedIndex]);
			}
		});

		nextBtn.addEventListener('click', () => {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				this.updateNav();
				this.renderDigest(filtered[this.selectedIndex]);
			}
		});
	}

	// ── Digest Content ──────────────────────────────────

	private renderDigest(digest: Digest | undefined) {
		if (!this.contentContainer) return;
		this.contentContainer.empty();

		if (!digest) {
			this.renderPlaceholder(this.contentContainer, `No ${this.filterPeriod} digests yet. EMRALD generates them automatically at your preferred digest hour.`);
			return;
		}

		const content = digest.content;

		// Generated timestamp
		this.contentContainer.createDiv({
			cls: 'emerald-wv-digest-generated',
			text: `Generated ${this.formatRelativeTime(digest.generated_at)}`
		});

		// ── Hero Stats Row ──
		this.renderHeroStats(this.contentContainer, content);

		// ── Effort Source Breakdown ──
		const effortSources = content.effort_source_mix;
		if (effortSources && effortSources.length > 0) {
			this.renderSection(this.contentContainer, 'pie-chart', 'Effort Source Breakdown', (el) => {
				this.renderEffortSources(el, effortSources);

				// Pattern insight (if present)
				const patternInsight = content.effort_source_insight;
				if (patternInsight) {
					el.createEl('p', { cls: 'emerald-wv-digest-pattern-insight', text: patternInsight });
				}
			});
		}

		// ── Effort Summary ──
		if (content.effort_summary) {
			this.renderSection(this.contentContainer, 'activity', 'Effort Summary', (el) => {
				el.createEl('p', { cls: 'emerald-wv-digest-summary-text', text: content.effort_summary! });
			});
		}

		// ── Top Projects (from API top_projects) ──
		if (content.top_projects && content.top_projects.length > 0) {
			this.renderSection(this.contentContainer, 'folder', 'Top Projects', (el) => {
				for (const proj of content.top_projects!) {
					const row = el.createDiv({ cls: 'emerald-wv-digest-completed-row' });
					const icon = row.createSpan({ cls: 'emerald-wv-digest-check-icon' });
					setIcon(icon, 'folder');
					const label = `${proj.name} — ${proj.sessions} session${proj.sessions === 1 ? '' : 's'}, ${proj.hours.toFixed(1)}h`;
					row.createSpan({ text: label });
				}
			});
		}

		// ── Metric Movements (legacy shape; kept for forward-compat) ──
		if (content.metric_movements && content.metric_movements.length > 0) {
			this.renderSection(this.contentContainer, 'trending-up', 'Metric movements', (el) => {
				this.renderMetricMovements(el, content.metric_movements!);
			});
		}

		// ── Key Insights (API: top_insights; legacy: insight_highlights) ──
		const insights = content.top_insights ?? content.insight_highlights;
		if (insights && insights.length > 0) {
			this.renderSection(this.contentContainer, 'lightbulb', 'Key insights', (el) => {
				for (const highlight of insights) {
					const row = el.createDiv({ cls: 'emerald-wv-digest-insight-row' });
					const bullet = row.createSpan({ cls: 'emerald-wv-digest-insight-bullet' });
					setIcon(bullet, 'sparkle');
					row.createSpan({ text: highlight });
				}
			});
		}

		// ── Comparison to Prior Period ──
		const cmp = content.comparison_to_prior;
		if (cmp && (cmp.sessions_delta !== 0 || cmp.hours_delta !== 0 || cmp.flow_delta !== 0)) {
			this.renderSection(this.contentContainer, 'trending-up', 'Compared to Prior Week', (el) => {
				const fmt = (n: number, suffix: string) => `${n > 0 ? '+' : ''}${n}${suffix}`;
				el.createDiv({ cls: 'emerald-wv-digest-insight-row', text: `Sessions: ${fmt(cmp.sessions_delta, '')}` });
				el.createDiv({ cls: 'emerald-wv-digest-insight-row', text: `Hours: ${fmt(+cmp.hours_delta.toFixed(1), 'h')}` });
				el.createDiv({ cls: 'emerald-wv-digest-insight-row', text: `Flow rate: ${fmt(+(cmp.flow_delta * 100).toFixed(0), '%')}` });
			});
		}

		// ── Completed Projects (legacy) ──
		if (content.completed_projects && content.completed_projects.length > 0) {
			this.renderSection(this.contentContainer, 'check-circle', 'Completed', (el) => {
				for (const proj of content.completed_projects!) {
					const row = el.createDiv({ cls: 'emerald-wv-digest-completed-row' });
					const check = row.createSpan({ cls: 'emerald-wv-digest-check-icon' });
					setIcon(check, 'check');
					row.createSpan({ text: proj });
				}
			});
		}

		// ── Burnout Status ──
		if (content.burnout_status) {
			this.renderSection(this.contentContainer, 'flame', 'Burnout Status', (el) => {
				el.createEl('p', { text: content.burnout_status! });
			});
		}

		// ── No Content Fallback ──
		const hasContent = content.session_count !== undefined ||
			content.total_sessions !== undefined ||
			content.total_hours !== undefined ||
			content.effort_summary || content.top_insights?.length ||
			content.insight_highlights?.length || content.top_projects?.length ||
			content.metric_movements?.length || content.completed_projects?.length ||
			content.burnout_status;

		if (!hasContent) {
			this.renderPlaceholder(this.contentContainer, 'This digest has no content yet. It may still be generating.');
		}

		// ── Delivery Schedule Footer ──
		this.renderDeliveryFooter(this.contentContainer);
	}

	// ── Effort Source Breakdown ──────────────────────────

	private renderEffortSources(container: Element, sources: Array<{ source: string; percentage: number }>) {
		// Sort by percentage descending
		const sorted = [...sources].sort((a, b) => b.percentage - a.percentage);

		const SOURCE_ICONS: Record<string, string> = {
			'Complexity': 'brain',
			'Emotional Drain': 'heart-crack',
			'High Motivation': 'rocket',
			'Physical': 'dumbbell',
			'Monotony': 'repeat',
			'Time Pressure': 'alarm-clock'
		};

		// Summary line (like AP(E)CS: "🧠 58%  💭 28%  🔥 14%")
		const summaryRow = container.createDiv({ cls: 'emerald-wv-digest-source-summary' });
		for (const src of sorted) {
			const chip = summaryRow.createSpan({ cls: 'emerald-wv-digest-source-chip' });
			const iconEl = chip.createSpan({ cls: 'emerald-wv-digest-source-chip-icon' });
			setIcon(iconEl, SOURCE_ICONS[src.source] ?? 'circle');
			chip.createSpan({ text: `${src.percentage}%` });
		}

		const dominantLabel = sorted[0]?.source ?? '';
		if (dominantLabel) {
			summaryRow.createSpan({
				cls: 'emerald-wv-digest-source-dominant',
				text: `${dominantLabel}-led`
			});
		}

		// Bars
		for (const src of sorted) {
			const row = container.createDiv({ cls: 'emerald-wv-digest-source-row' });

			const labelRow = row.createDiv({ cls: 'emerald-wv-digest-source-label-row' });
			const iconEl = labelRow.createSpan({ cls: 'emerald-wv-digest-source-icon' });
			setIcon(iconEl, SOURCE_ICONS[src.source] ?? 'circle');
			labelRow.createSpan({ cls: 'emerald-wv-digest-source-name', text: src.source });
			labelRow.createSpan({ cls: 'emerald-wv-digest-source-pct', text: `${src.percentage}%` });

			const barOuter = row.createDiv({ cls: 'emerald-wv-digest-source-bar' });
			const barFill = barOuter.createDiv({ cls: 'emerald-wv-digest-source-fill' });
			barFill.style.width = `${src.percentage}%`;
			barFill.dataset.source = src.source.toLowerCase().replace(/\s+/g, '-');
		}
	}

	// ── Delivery Footer ─────────────────────────────────

	private renderDeliveryFooter(container: Element) {
		const day = this.plugin.settings?.digestDay ?? 'sunday';
		const time = this.plugin.settings?.digestTime ?? '09:00';
		const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);

		const footer = container.createDiv({ cls: 'emerald-wv-digest-delivery-footer' });
		footer.createSpan({
			text: `Digest delivered every ${dayLabel} at ${time} · `
		});
		const changeLink = footer.createEl('a', {
			cls: 'emerald-wv-digest-settings-link',
			text: 'Change in settings'
		});
		changeLink.addEventListener('click', (e) => {
			e.preventDefault();
			// Open Obsidian settings to EMRALD tab
			((this.app as unknown as Record<string, unknown>).setting as Record<string, (...args: unknown[]) => void> | undefined)?.open?.();
			((this.app as unknown as Record<string, unknown>).setting as Record<string, (...args: unknown[]) => void> | undefined)?.openTabById?.('EMRALD');
		});
	}

	// ── Hero Stats ──────────────────────────────────────

	private renderHeroStats(container: Element, content: DigestContent) {
		const stats = container.createDiv({ cls: 'emerald-wv-digest-stats' });

		// Sessions: API uses session_count; legacy total_sessions kept as fallback
		const sessions = content.session_count ?? content.total_sessions ?? 0;
		this.renderStatCard(stats, 'bar-chart-2', 'Sessions', String(sessions));

		// Total time: API stores total_hours (already hours); legacy total_minutes fallback
		const totalMinutes = content.total_hours !== undefined
			? Math.round(content.total_hours * 60)
			: (content.total_minutes ?? 0);
		this.renderStatCard(stats, 'timer', 'Total Time', this.formatDuration(totalMinutes));

		// Flow rate: API returns 0..1 fraction; legacy was already 0..100
		const rawFlow = content.flow_rate;
		let flowPct: number | undefined;
		if (rawFlow !== undefined && rawFlow !== null) {
			flowPct = rawFlow <= 1 ? Math.round(rawFlow * 100) : Math.round(rawFlow);
		}
		this.renderStatCard(stats, 'zap', 'Flow Rate',
			flowPct !== undefined ? `${flowPct}%` : '—',
			flowPct !== undefined ? this.getFlowRateLabel(flowPct) : undefined);

		// Projects: derived from top_projects.length; legacy projects_worked fallback
		const projectsCount = content.top_projects?.length ?? content.projects_worked ?? 0;
		this.renderStatCard(stats, 'folder', 'Projects', String(projectsCount));

		// Avg Sleep: prefer avg_energy.sleep (1-10 scale); legacy avg_sleep was 1-5
		const sleep10 = content.avg_energy?.sleep;
		const sleepLegacy = content.avg_sleep;
		let sleepLabel = '—';
		if (typeof sleep10 === 'number') sleepLabel = this.getSleepLabel10(sleep10);
		else if (typeof sleepLegacy === 'number') sleepLabel = this.getSleepLabel(sleepLegacy);
		this.renderStatCard(stats, 'moon', 'Avg Sleep', sleepLabel);

		// Top Project: derive from top_projects[0]; legacy top_project fallback
		const topProjectName = content.top_projects && content.top_projects.length > 0
			? content.top_projects[0].name
			: content.top_project;
		if (topProjectName) {
			this.renderStatCard(stats, 'trophy', 'Top Project', topProjectName);
		}
	}

	private getSleepLabel10(avg: number): string {
		if (avg >= 8) return 'Great';
		if (avg >= 6) return 'Fair';
		if (avg >= 4) return 'Poor';
		return 'Critical';
	}

	private renderStatCard(container: Element, iconId: string, label: string, value: string, sublabel?: string) {
		const card = container.createDiv({ cls: 'emerald-wv-stat-card' });
		const iconEl = card.createDiv({ cls: 'emerald-wv-stat-icon' });
		setIcon(iconEl, iconId);
		card.createDiv({ cls: 'emerald-wv-stat-value', text: value });
		card.createDiv({ cls: 'emerald-wv-stat-label', text: label });
		if (sublabel) {
			card.createDiv({ cls: 'emerald-wv-stat-sublabel', text: sublabel });
		}
	}

	private getFlowRateLabel(rate: number): string {
		if (rate >= 50) return 'Excellent';
		if (rate >= 35) return 'Developing';
		if (rate >= 20) return 'Building';
		return 'Emerging';
	}

	private getSleepLabel(avg: number): string {
		if (avg >= 4) return 'Great';
		if (avg >= 3) return 'Fair';
		if (avg >= 2) return 'Poor';
		return 'Critical';
	}

	// ── Metric Movements ────────────────────────────────

	private renderMetricMovements(container: Element, movements: Array<{ key: string; change: number; direction: 'up' | 'down' | 'stable' }>) {
		const grid = container.createDiv({ cls: 'emerald-wv-digest-movements' });

		for (const movement of movements) {
			const row = grid.createDiv({ cls: 'emerald-wv-digest-metric-row' });

			// Metric key badge
			row.createSpan({ cls: 'emerald-wv-digest-metric-key', text: movement.key });

			// Direction arrow with color
			const arrowCls = movement.direction === 'up' ? 'emerald-wv-trend-up'
				: movement.direction === 'down' ? 'emerald-wv-trend-down'
				: 'emerald-wv-trend-flat';
			const arrow = movement.direction === 'up' ? '▲' : movement.direction === 'down' ? '▼' : '—';
			const sign = movement.change > 0 ? '+' : '';

			row.createSpan({
				cls: arrowCls,
				text: `${arrow} ${sign}${movement.change.toFixed(1)}`
			});
		}
	}

	// ── Section Helper ──────────────────────────────────

	private renderSection(container: Element, iconId: string, title: string, renderContent: (el: Element) => void) {
		const section = container.createDiv({ cls: 'emerald-wv-digest-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-digest-section-header' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-digest-section-icon' });
		setIcon(iconEl, iconId);
		headerRow.createEl('h4', { text: title });

		const body = section.createDiv({ cls: 'emerald-wv-digest-section-body' });
		renderContent(body);
	}

	// ── Formatters ──────────────────────────────────────

	private formatPeriodType(type: string): string {
		switch (type) {
			case 'daily': return 'Daily';
			case 'weekly': return 'Weekly';
			case 'monthly': return 'Monthly';
			default: return type;
		}
	}

	private formatDateShort(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	private formatRelativeTime(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(hours / 24);

		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h ago`;
		if (days === 1) return 'yesterday';
		if (days < 7) return `${days} days ago`;
		return this.formatDate(iso);
	}
}
