// EMRALD Data Center — Deep dive into all 20 D-metrics.
// Features: metric grid with current values, SVG time-series graphs,
// time range toggle, info popovers, pin management, "need more data" states.
// This is the crown jewel — Obsidian-native, data-dense, beautiful.

import { WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_DATA_CENTER } from './base';
import { ComputedMetric, ComputedMetricHistory } from '../../api/client';
import { tierState } from '../../tier';

// ── D-Metric Catalog ────────────────────────────────────

interface MetricInfo {
	name: string;
	desc: string;
	unit: string;
	explainer: string;    // What does this number mean in plain English?
	goodDirection: 'up' | 'down' | 'stable' | 'varies';  // For coloring trends
	category: string;
}

const D_METRICS: Record<string, MetricInfo> = {
	D1:  { name: 'Effort Balance',           unit: '/10',  category: 'Effort',       goodDirection: 'up',
	       desc: 'How well your effort matches task demands',
	       explainer: '10 = perfectly balanced. Lower scores mean a growing gap between what tasks demand and what you invest. Chronic imbalance in either direction (over-investing or under-investing) is a signal to adjust.' },
	D2:  { name: 'Effort Balance Trend',     unit: '/10',  category: 'Effort',       goodDirection: 'stable',
	       desc: 'Is your effort balance improving or worsening?',
	       explainer: '5 = stable. Above 5 = the gap is widening (worsening). Below 5 = the gap is closing (improving). This metric takes time to populate — it compares two halves of a 30-day window, so you need sessions spread across at least 2–3 weeks.' },
	D3:  { name: 'E-Level Accuracy',         unit: '/10',  category: 'Calibration',  goodDirection: 'up',
	       desc: 'How well E-levels predict actual effort',
	       explainer: 'Compares your E-level assignments to actual perceived effort from receipts. Higher = better calibration. Low accuracy suggests your E-levels need adjusting.' },
	D4:  { name: 'Context Switching',        unit: '/10',  category: 'Productivity', goodDirection: 'down',
	       desc: 'How often you jump between projects in a day',
	       explainer: 'Higher = more switching. Some variety is healthy, but frequent switching fragments focus and increases cognitive load. Look at this alongside D7 (Flow Frequency).' },
	D5:  { name: 'Task Initiation',          unit: '/10',  category: 'Productivity', goodDirection: 'down',
	       desc: 'How long before you start working on new projects',
	       explainer: 'Measures days between creating a project and starting your first session. Higher = longer delays. Persistent high values may signal procrastination or overwhelm. Only counts active projects — set projects to Inactive if they\'re intentionally "on deck" so they don\'t inflate this metric.' },
	D6:  { name: 'Avoidance Pattern',        unit: '/10',  category: 'Effort',       goodDirection: 'down',
	       desc: 'Projects showing signs of avoidance',
	       explainer: 'Flags projects with no sessions, very short sessions, discarded sessions, or long gaps since last session. Higher = more avoidance signals detected.' },
	D7:  { name: 'Flow Frequency',           unit: '/10',  category: 'Effort',       goodDirection: 'up',
	       desc: 'How often you enter deep focus states',
	       explainer: 'Percentage of sessions where you reported flow. Higher is better — flow is where your best work happens. Compare with D11 (Peak Hours) to find when flow happens most.' },
	D8:  { name: 'Burnout Risk',             unit: '/100', category: 'Energy',       goodDirection: 'down',
	       desc: 'Combined risk score from multiple fatigue signals',
	       explainer: 'The big one. Combines rising effort, declining enjoyment, low flow, emotional strain, and context switching. 0-30 = green, 30-50 = watch it, 50-70 = slow down, 70+ = recharge needed.' },
	D9:  { name: 'Effort Volatility',        unit: '/10',  category: 'Effort',       goodDirection: 'down',
	       desc: 'How wildly your effort varies session to session',
	       explainer: 'Based on standard deviation of perceived effort. High volatility means unpredictable work experiences. Some variation is healthy; wild swings suggest inconsistent task matching.' },
	D10: { name: 'Sleep Quality Trend',      unit: '/10',  category: 'Energy',       goodDirection: 'up',
	       desc: 'Your sleep quality from energy check-ins',
	       explainer: 'Rolling average of sleep quality scores from your daily check-ins. Compares recent 7 days vs. prior period to detect improving or declining trends.' },
	D11: { name: 'Peak Hours',               unit: '',     category: 'Productivity', goodDirection: 'varies',
	       desc: 'When you do your best work',
	       explainer: 'Maps session quality (enjoyment + flow) to time of day over 60 days. Helps identify your peak hours and dead zones. Use this to schedule demanding work optimally.' },
	D12: { name: 'Completion Rate',          unit: '/10',  category: 'Productivity', goodDirection: 'up',
	       desc: 'Completed vs. abandoned projects',
	       explainer: 'Ratio of completed projects to completed + abandoned. Higher = you finish what you start. Note: only counts projects you\'ve explicitly marked completed or abandoned.' },
	D13: { name: 'Energy Oscillation',       unit: '/10',  category: 'Energy',       goodDirection: 'up',
	       desc: 'E-level variety in your daily sessions',
	       explainer: 'Measures whether you mix E-levels throughout the day. Higher = more variety (alternating E2 and E4 work). All-E4 days score low — mixing intensity levels is healthier.' },
	D14: { name: 'Flow Quality',             unit: '/10',  category: 'Effort',       goodDirection: 'up',
	       desc: 'How enjoyable your flow sessions are',
	       explainer: 'Average enjoyment (hedonic valence) during flow sessions. High flow + low enjoyment = "grinding" — technically focused but not fulfilling. Watch for that pattern.' },
	D15: { name: 'Effort sources',           unit: '',     category: 'Effort',       goodDirection: 'varies',
	       desc: 'Where your effort comes from (complexity, emotional, etc.)',
	       explainer: 'Shows the breakdown of what makes your work effortful. If one source dominates (e.g., emotional drain), it\'s worth investigating why. Balanced = healthy diversity.' },
	D16: { name: 'Disengagement Risk',       unit: '/10',  category: 'Energy',       goodDirection: 'down',
	       desc: 'High effort + low investment pattern',
	       explainer: 'Detects sessions where you worked hard but weren\'t really invested. This "going through the motions" pattern is a burnout precursor. Higher = more disengagement signals.' },
	D17: { name: 'Energy-Effort Link',       unit: '/10',  category: 'Energy',       goodDirection: 'up',
	       desc: 'How starting energy affects your work',
	       explainer: 'Pearson correlation between your daily energy check-in scores and session effort. Positive = better energy leads to better work. Near zero = your work quality is disconnected from how you feel.' },
	D18: { name: 'Session Quality',          unit: '/10',  category: 'Productivity', goodDirection: 'up',
	       desc: 'Overall quality score for your sessions',
	       explainer: 'Composite of enjoyment (40%), flow rate (30%), and effort balance (30%). A holistic view of how your sessions are going — not just productive, but fulfilling.' },
	D19: { name: 'Calibration Drift',        unit: '/10',  category: 'Calibration',  goodDirection: 'down',
	       desc: 'How much your behavior diverges from your profile',
	       explainer: 'Compares your actual effort patterns to what your calibration profile predicts. High drift = time to recalibrate. Your work habits may have shifted since you last answered the profile questions.' },
	D20: { name: 'Recharge Effectiveness',   unit: '/10',  category: 'Energy',       goodDirection: 'up',
	       desc: 'How well your recharge routines restore energy',
	       explainer: 'Average effectiveness of your logged recharge activities. If this is low, your current routines may not be working — try experimenting with different activities.' }
};

const CATEGORIES = ['Effort', 'Energy', 'Productivity', 'Calibration'];

const CATEGORY_ICONS: Record<string, string> = {
	Effort: 'flame',
	Energy: 'battery-charging',
	Productivity: 'trending-up',
	Calibration: 'sliders'
};

// SVG chart constants
const CHART_WIDTH = 360;
const CHART_HEIGHT = 104;
const CHART_PAD = 4;

export class DataCenterView extends EmraldWorkspaceView {
	private metricMap: Map<string, ComputedMetric> = new Map();
	private prevValueMap: Map<string, number> = new Map(); // Previous values for trend indicators
	private expandedKeys: Set<string> = new Set();
	private timeRange: '7d' | '14d' | '30d' | '90d' = '14d';
	private pinnedKeys: Set<string>;
	private pinnedNoteText: HTMLElement;
	private gridContainer: Element | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'Data center');
		this.pinnedKeys = new Set(plugin.settings?.pinnedMetricKeys ?? ['D1', 'D8', 'D12', 'D3']);
	}

	getViewType(): string { return VIEW_DATA_CENTER; }

	async onOpen() {
		const container = this.getContainer();
		this.renderHeader(container, 'Data center', 'All 20 D-metrics — your effort fingerprint', 'trending-up');

		// Pinned metrics note
		const pinnedNote = container.createEl('div', { cls: 'emerald-wv-dc-pinned-note' });
		const pinIcon = pinnedNote.createEl('span', { cls: 'emerald-wv-dc-pin-icon' });
		setIcon(pinIcon, 'pin');
		this.pinnedNoteText = pinnedNote.createEl('span', {
			text: `Sidebar sparklines: ${Array.from(this.pinnedKeys).join(', ')}. Click any metric's ★ to change.`
		});

		// Time range selector
		this.renderTimeRange(container);

		// Load metrics
		let resp;
		try {
			resp = await this.plugin.apiClient.getMetrics();
		} catch (e) {
			this.renderError(container, 'Could not load metric data — check your connection.');
			return;
		}

		// Offline: no data and no cache — show offline message (P15 fix)
		if (!resp.data && (resp.status === 0 || resp.error)) {
			this.renderError(container, 'Offline — metric data will load when you reconnect.');
			return;
		}

		// Stale data banner when showing cached data offline (P15 fix)
		if (resp.fromCache || this.isOffline()) {
			this.renderStaleBanner(container);
		}

		this.metricMap = new Map();
		if (resp.data) {
			for (const m of resp.data) {
				this.metricMap.set(m.metric_key, m);
			}
		}

		// Fetch previous values for trend indicators (2-day history, all keys in parallel)
		this.prevValueMap = new Map();
		const fromDate = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
		const trendFetches = Object.keys(D_METRICS).map(async (key) => {
			const histResp = await this.plugin.apiClient.getMetricHistory(key, fromDate);
			const normalized = this.normalizeHistory(histResp.data ?? []);
			if (normalized.length >= 2) {
				const prev = normalized[normalized.length - 2];
				if (prev.value !== null) {
					this.prevValueMap.set(key, prev.value);
				}
			}
		});
		await Promise.all(trendFetches);

		// Render by category
		this.gridContainer = container.createEl('div', { cls: 'emerald-wv-dc-categories' });

		// "Your Story" summary card at the top
		this.renderStorySummary(container, this.gridContainer);

		this.renderAllCategories();
	}

	// ── Time Range ──────────────────────────────────────

	// ── "Your Story" Summary ────────────────────────────

	private renderStorySummary(container: Element, insertBefore: Element) {
		const metrics = this.metricMap;
		const d8 = metrics.get('D8');
		const d1 = metrics.get('D1');
		const d7 = metrics.get('D7');
		const d18 = metrics.get('D18');

		// Only show if we have at least burnout risk data
		if (!d8 || d8.value === null) return;

		const card = container.createEl('div', { cls: 'emerald-wv-story-card emerald-fade-in' });
		container.insertBefore(card, insertBefore);

		const headerRow = card.createEl('div', { cls: 'emerald-wv-story-header' });
		const iconEl = headerRow.createEl('span', { cls: 'emerald-wv-story-icon' });
		setIcon(iconEl, 'book-open');
		headerRow.createEl('span', { cls: 'emerald-wv-story-title', text: 'Your story' });

		const body = card.createEl('div', { cls: 'emerald-wv-story-body' });

		// Build narrative sentences
		const sentences: string[] = [];

		// Burnout risk narrative
		const burnout = d8.value;
		if (burnout <= 30) {
			sentences.push('You\'re in a healthy zone — burnout risk is low.');
		} else if (burnout <= 50) {
			sentences.push('Your burnout risk is moderate. Keep an eye on your energy levels.');
		} else if (burnout <= 70) {
			sentences.push('Burnout risk is elevated — consider scaling back or adding recharge time.');
		} else {
			sentences.push('Burnout risk is high. Your data strongly suggests it\'s time to recharge.');
		}

		// Effort balance
		if (d1 && d1.value !== null) {
			if (d1.value >= 7) {
				sentences.push('Your effort balance is strong — you\'re matching effort to demand well.');
			} else if (d1.value >= 4) {
				sentences.push('Effort balance is middling — there\'s a gap between what tasks demand and what you invest.');
			} else {
				sentences.push('Effort balance is low — there\'s a significant mismatch in how you allocate effort.');
			}
		}

		// Flow
		if (d7 && d7.value !== null) {
			if (d7.value >= 6) {
				sentences.push('You\'re hitting flow states regularly — that\'s where your best work happens.');
			} else if (d7.value >= 3) {
				sentences.push('Flow is occasional. Check D11 (Peak Hours) to find when focus comes easiest.');
			} else {
				sentences.push('Flow has been rare lately. Consider fewer context switches and longer uninterrupted blocks.');
			}
		}

		// Session quality
		if (d18 && d18.value !== null) {
			if (d18.value >= 7) {
				sentences.push('Overall session quality is excellent — productive and fulfilling.');
			} else if (d18.value < 4) {
				sentences.push('Session quality is low — you may be grinding without genuine engagement.');
			}
		}

		const list = body.createEl('ul');
		for (const sentence of sentences) {
			list.createEl('li', { text: sentence });
		}
	}

	private renderTimeRange(container: Element) {
		const bar = container.createEl('div', { cls: 'emerald-wv-filter-bar' });

		for (const range of ['7d', '14d', '30d', '90d'] as const) {
			const btn = bar.createEl('button', {
				cls: `emerald-wv-filter-btn ${range === this.timeRange ? 'is-active' : ''}`,
				text: range
			});
			btn.addEventListener('click', () => {
				this.timeRange = range;
				bar.querySelectorAll('.emerald-wv-filter-btn').forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
				// Re-render expanded cards to update charts
				if (this.gridContainer) {
					this.renderAllCategories();
				}
			});
		}
	}

	// ── Category Rendering ──────────────────────────────

	private renderAllCategories() {
		if (!this.gridContainer) return;
		this.gridContainer.empty();

		for (const category of CATEGORIES) {
			const keys = Object.entries(D_METRICS)
				.filter(([_, info]) => info.category === category)
				.map(([key]) => key);

			if (keys.length === 0) continue;

			const section = this.gridContainer.createEl('div', { cls: 'emerald-wv-dc-category' });

			const headerRow = section.createEl('div', { cls: 'emerald-wv-section-header-row' });
			const iconEl = headerRow.createEl('span', { cls: 'emerald-wv-section-icon' });
			setIcon(iconEl, CATEGORY_ICONS[category] ?? 'hash');
			headerRow.createEl('h3', { text: category });

			const grid = section.createEl('div', { cls: 'emerald-wv-metric-grid' });

			for (const key of keys) {
				const info = D_METRICS[key];
				const metric = this.metricMap.get(key);
				this.renderMetricCard(grid, key, info, metric);
			}
		}

		// Pro teaser for free users — compact banner after all categories
		if (!tierState.isPro()) {
			const teaser = this.gridContainer.createEl('div', { cls: 'emerald-wv-dc-pro-teaser' });
			const teaserIcon = teaser.createEl('span', { cls: 'emerald-wv-dc-pro-teaser-icon' });
			setIcon(teaserIcon, 'sparkles');
			const teaserText = teaser.createEl('span', { cls: 'emerald-wv-dc-pro-teaser-text' });
			teaserText.createEl('span', { text: 'Unlock D9\u2013D20: ' });
			teaserText.createEl('span', {
				cls: 'emerald-wv-dc-pro-teaser-detail',
				text: 'recovery effectiveness, effort volatility, calibration drift, project momentum, and more.'
			});
			const teaserLink = teaser.createEl('a', {
				cls: 'emerald-wv-dc-pro-teaser-link',
				text: 'Upgrade to Pro \u2192',
				href: 'https://app.effortmastery.com/app/billing'
			});
			teaserLink.setAttribute('target', '_blank');
		}
	}

	// ── Metric Card ─────────────────────────────────────

	private renderMetricCard(grid: Element, key: string, info: MetricInfo, metric: ComputedMetric | undefined) {
		const isExpanded = this.expandedKeys.has(key);
		const isPinned = this.pinnedKeys.has(key);
		const hasData = metric && metric.value !== null;

		// D9-D20 are Pro-only — free users see frosted cards
		const keyNum = parseInt(key.replace('D', ''), 10);
		const isProMetric = keyNum >= 9;
		const isLocked = isProMetric && !tierState.isPro();

		const card = grid.createEl('div', {
			cls: `emerald-wv-metric-card ${isExpanded ? 'is-expanded' : ''} ${!hasData ? 'is-no-data' : ''} ${isLocked ? 'is-locked' : ''}`
		});

		// Category color border
		if (info.category) {
			card.dataset.category = info.category.toLowerCase();
		}

		// ── Header Row: key + pin + value ──
		const header = card.createEl('div', { cls: 'emerald-wv-metric-header' });

		const keyRow = header.createEl('div', { cls: 'emerald-wv-metric-key-row' });
		keyRow.createEl('span', { cls: 'emerald-wv-metric-key', text: key });

		// Pin toggle (not on locked cards)
		if (!isLocked) {
			const pinBtn = keyRow.createEl('button', {
				cls: `emerald-wv-pin-btn ${isPinned ? 'is-pinned' : ''}`,
				text: isPinned ? '★' : '☆'
			});
			pinBtn.title = isPinned ? 'Unpin from sidebar' : 'Pin to sidebar sparklines';
			pinBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.togglePin(key, pinBtn);
			});
		}

		// Value + trend indicator
		const valueWrap = header.createEl('div', { cls: 'emerald-wv-metric-value-wrap' });
		// D8 is stored on 0-10 scale but displayed as 0-100 (matches Burnout Monitor)
		const displayValue = hasData
			? (key === 'D8' ? metric!.value! * 10 : metric!.value!)
			: null;
		const valueText = displayValue !== null
			? `${displayValue.toFixed(key === 'D8' ? 0 : 1)}${info.unit}`
			: '—';
		valueWrap.createEl('span', {
			cls: `emerald-wv-metric-value ${!hasData ? 'is-no-data' : ''}`,
			text: valueText
		});

		// Mini trend indicator (▲/▼/→)
		if (hasData && this.prevValueMap.has(key)) {
			const prevVal = this.prevValueMap.get(key)!;
			// Use display-scaled values for D8 trend comparison
			const currentDisplay = key === 'D8' ? metric!.value! * 10 : metric!.value!;
			const prevDisplay = key === 'D8' ? prevVal * 10 : prevVal;
			const delta = currentDisplay - prevDisplay;
			const threshold = key === 'D8' ? 0.5 : 0.05; // Wider threshold for 0-100 scale

			let arrow = '→';
			let trendCls = 'emerald-wv-trend-neutral';

			if (Math.abs(delta) > threshold) {
				const isUp = delta > 0;
				arrow = isUp ? '▲' : '▼';

				// Color based on whether this direction is "good"
				if (info.goodDirection === 'up') {
					trendCls = isUp ? 'emerald-wv-trend-good' : 'emerald-wv-trend-bad';
				} else if (info.goodDirection === 'down') {
					trendCls = isUp ? 'emerald-wv-trend-bad' : 'emerald-wv-trend-good';
				} else if (info.goodDirection === 'stable') {
					trendCls = 'emerald-wv-trend-caution'; // Any big move is noteworthy
				}
				// 'varies' stays neutral
			}

			valueWrap.createEl('span', { cls: `emerald-wv-trend-arrow ${trendCls}`, text: arrow });
		}

		// ── Name ──
		card.createEl('div', { cls: 'emerald-wv-metric-name', text: info.name });

		// ── Description ──
		card.createEl('div', { cls: 'emerald-wv-metric-desc', text: info.desc });

		// ── No Data State ──
		if (!hasData && !isLocked) {
			const noData = card.createEl('div', { cls: 'emerald-wv-metric-nodata' });
			noData.createEl('span', { text: 'Need more data' });
		}

		// ── Last computed ──
		if (metric && !isLocked) {
			card.createEl('div', {
				cls: 'emerald-wv-metric-updated',
				text: `Updated: ${this.formatRelativeTime(metric.computed_at)}`
			});
		}

		// ── Frosted Pro overlay for locked metrics ──
		if (isLocked) {
			const overlay = card.createEl('div', { cls: 'emerald-wv-metric-locked-overlay' });
			const lockIcon = overlay.createEl('span', { cls: 'emerald-wv-metric-lock-icon' });
			setIcon(lockIcon, 'lock');
			overlay.createEl('span', { cls: 'emerald-wv-metric-lock-text', text: 'Pro' });
			card.addClass('emrald-not-clickable');
		} else {
			// Click to expand/collapse (free metrics only)
			card.addClass('emrald-clickable');
			card.addEventListener('click', () => this.toggleExpand(key));
		}

		// ── Expanded Section ──
		if (isExpanded && !isLocked) {
			void this.renderExpandedSection(card, key, info, metric);
		}
	}

	// ── Expanded Section (chart + explainer + history) ──

	private async renderExpandedSection(card: Element, key: string, info: MetricInfo, metric: ComputedMetric | undefined) {
		const expanded = card.createEl('div', { cls: 'emerald-wv-metric-expanded' });

		// Info explainer
		const explainerEl = expanded.createEl('div', { cls: 'emerald-wv-metric-explainer' });
		const infoIcon = explainerEl.createEl('span', { cls: 'emerald-wv-metric-info-icon' });
		setIcon(infoIcon, 'info');
		explainerEl.createEl('span', { text: info.explainer });

		// Loading placeholder for chart
		const chartArea = expanded.createEl('div', { cls: 'emerald-wv-metric-chart-area' });
		chartArea.createEl('div', { cls: 'emerald-wv-loading', text: 'Loading history...' });

		// Fetch history
		const daysMap: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
		const days = daysMap[this.timeRange] ?? 14;
		const fromDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

		const histResp = await this.plugin.apiClient.getMetricHistory(key, fromDate);
		chartArea.empty();

		const entries = this.normalizeHistory(histResp.data ?? []).slice(-days); // oldest → newest, one per day
		if (entries.length === 0) {
			chartArea.createEl('div', { cls: 'emerald-wv-empty', text: `No history data for the last ${this.timeRange}.` });
			return;
		}

		// Metric-specific visualizations
		if (key === 'D15') {
			const latest = entries[entries.length - 1];
			chartArea.appendChild(this.buildEffortSourceChart(metric, latest));
		} else if (key === 'D11') {
			const latest = entries[entries.length - 1];
			chartArea.appendChild(this.buildTimeOfDayChart(metric, latest));
		} else if (entries.length >= 2) {
			chartArea.appendChild(this.buildLineChart(entries, info, key));
		} else {
			chartArea.createEl('div', { cls: 'emerald-wv-empty', text: 'Only 1 data point — need at least 2 for a chart.' });
		}

		// History table (below chart) — skip for D11 and D15 (custom viz IS the data story)
		if (key !== 'D11' && key !== 'D15') {
			this.renderHistoryTable(expanded, entries, info, key);
		}
	}

	// ── SVG Line Chart ──────────────────────────────────

	private buildLineChart(entries: ComputedMetricHistory[], info: MetricInfo, metricKey?: string): SVGElement {
		const isD8 = metricKey === 'D8';
		// Scale D8 values from stored 0-10 to display 0-100
		const values = entries.map(e => {
			const v = e.value ?? 0;
			return isD8 ? v * 10 : v;
		});
		// Fixed Y-axis range so semantic zones align correctly.
		// Most metrics are 0-10, D8 (Burnout Risk) is 0-100.
		const min = 0;
		const max = info.unit === '/100' ? 100 : 10;
		const range = max - min;
		const zones = this.getMetricZones(info);

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', String(CHART_HEIGHT));
		svg.setAttribute('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
		svg.classList.add('emerald-wv-metric-svg');

		// Background semantic zones (good / caution / risk)
		for (const zone of zones) {
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			const zoneTop = CHART_PAD + (1 - zone.to) * (CHART_HEIGHT - CHART_PAD * 2);
			const zoneBottom = CHART_PAD + (1 - zone.from) * (CHART_HEIGHT - CHART_PAD * 2);
			rect.setAttribute('x', '0');
			rect.setAttribute('y', String(zoneTop));
			rect.setAttribute('width', String(CHART_WIDTH));
			rect.setAttribute('height', String(Math.max(zoneBottom - zoneTop, 1)));
			rect.setAttribute('fill', zone.color);
			rect.classList.add('emerald-wv-chart-zone');
			svg.appendChild(rect);
		}

		// Grid lines (3 horizontal)
		for (let i = 0; i <= 2; i++) {
			const y = CHART_PAD + ((CHART_HEIGHT - CHART_PAD * 2) / 2) * i;
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', '0');
			line.setAttribute('y1', String(y));
			line.setAttribute('x2', String(CHART_WIDTH));
			line.setAttribute('y2', String(y));
			line.classList.add('emerald-wv-chart-grid');
			svg.appendChild(line);
		}

		// Build points
		const step = values.length > 1 ? CHART_WIDTH / (values.length - 1) : 0;
		const points: string[] = [];
		const coords: Array<{ x: number; y: number; value: number; date: string }> = [];

		for (let i = 0; i < values.length; i++) {
			const x = i * step;
			const normalized = (values[i] - min) / range;
			const y = (CHART_HEIGHT - CHART_PAD) - normalized * (CHART_HEIGHT - CHART_PAD * 2);
			points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
			coords.push({ x, y, value: values[i], date: entries[i].computed_at });
		}

		// Area fill (gradient under line)
		const areaPoints = [
			`0,${CHART_HEIGHT}`,
			...points,
			`${CHART_WIDTH},${CHART_HEIGHT}`
		];
		const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		area.setAttribute('points', areaPoints.join(' '));
		area.classList.add('emerald-wv-chart-area');
		svg.appendChild(area);

		// Line
		const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		polyline.setAttribute('points', points.join(' '));
		polyline.classList.add('emerald-wv-chart-line');
		svg.appendChild(polyline);

		// Dots at each data point
		for (const coord of coords) {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', String(coord.x));
			circle.setAttribute('cy', String(coord.y));
			circle.setAttribute('r', '3');
			circle.classList.add('emerald-wv-chart-dot');
			svg.appendChild(circle);
		}

		// Endpoint dot (larger, accent)
		const last = coords[coords.length - 1];
		if (last) {
			const endDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			endDot.setAttribute('cx', String(last.x));
			endDot.setAttribute('cy', String(last.y));
			endDot.setAttribute('r', '4');
			endDot.classList.add('emerald-wv-chart-dot-current');
			svg.appendChild(endDot);
		}

		// Min/max labels
		const maxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		maxLabel.setAttribute('x', String(CHART_WIDTH - 4));
		maxLabel.setAttribute('y', String(CHART_PAD + 10));
		maxLabel.setAttribute('text-anchor', 'end');
		maxLabel.classList.add('emerald-wv-chart-range-label');
		maxLabel.textContent = max.toFixed(1);
		svg.appendChild(maxLabel);

		const minLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		minLabel.setAttribute('x', String(CHART_WIDTH - 4));
		minLabel.setAttribute('y', String(CHART_HEIGHT - CHART_PAD));
		minLabel.setAttribute('text-anchor', 'end');
		minLabel.classList.add('emerald-wv-chart-range-label');
		minLabel.textContent = min.toFixed(1);
		svg.appendChild(minLabel);

		return svg;
	}

	private buildEffortSourceChart(metric: ComputedMetric | undefined, entry: ComputedMetricHistory): HTMLElement {
		const wrap = createDiv({ cls: 'emerald-wv-dist-chart' });

		const meta = ((metric?.metadata && Object.keys(metric.metadata).length > 0 ? metric.metadata : entry.metadata) ?? {}) as Record<string, unknown>;
		const rows = [
			{ label: 'Complexity', value: Number(meta.complexity_pct ?? 0) },
			{ label: 'Emotional', value: Number(meta.emotional_pct ?? 0) },
			{ label: 'Motivation', value: Number(meta.motivation_pct ?? 0) },
			{ label: 'Novelty', value: Number(meta.novelty_pct ?? 0) },
			{ label: 'Physical', value: Number(meta.physical_pct ?? 0) },
			{ label: 'Uncertainty', value: Number(meta.uncertainty_pct ?? 0) },
		].sort((a, b) => b.value - a.value);
		const dominantLabel = rows[0]?.label;

		for (const row of rows) {
			const item = wrap.createDiv({ cls: 'emerald-wv-dist-row' });
			if (row.label === dominantLabel && row.value > 0) item.addClass('is-dominant');
			item.createDiv({ cls: 'emerald-wv-dist-label', text: row.label });
			const bar = item.createDiv({ cls: 'emerald-wv-dist-bar' });
			const fill = bar.createDiv({ cls: 'emerald-wv-dist-fill' });
			fill.style.width = `${Math.max(row.value * 100, 4)}%`;
			item.createDiv({ cls: 'emerald-wv-dist-value', text: `${Math.round(row.value * 100)}%` });
		}

		return wrap;
	}

	private buildTimeOfDayChart(metric: ComputedMetric | undefined, entry: ComputedMetricHistory): HTMLElement {
		const wrap = createDiv({ cls: 'emerald-wv-time-chart' });

		const meta = ((metric?.metadata && Object.keys(metric.metadata).length > 0 ? metric.metadata : entry.metadata) ?? {}) as Record<string, unknown>;
		const byHour = (meta.by_hour ?? {}) as Record<string, { avg_valence?: number; flow_rate?: number; count?: number }>;
		const bestHours = new Set<number>((meta.best_hours as number[] | undefined) ?? []);
		const worstHours = new Set<number>((meta.worst_hours as number[] | undefined) ?? []);

		for (let hour = 0; hour < 24; hour++) {
			const stats = byHour[String(hour)] ?? byHour[hour as unknown as keyof typeof byHour];
			const bucket = wrap.createDiv({ cls: 'emerald-wv-time-bucket' });
			if (bestHours.has(hour)) bucket.addClass('is-best');
			if (worstHours.has(hour)) bucket.addClass('is-worst');
			if (!stats) bucket.addClass('is-empty');

			const score = stats ? ((Number(stats.avg_valence ?? 5) * 0.6) + (Number(stats.flow_rate ?? 0) * 10 * 0.4)) / 10 : 0;
			const fill = bucket.createDiv({ cls: 'emerald-wv-time-bucket-fill' });
			fill.style.height = `${Math.max(score * 100, stats ? 10 : 4)}%`;

			bucket.createDiv({ cls: 'emerald-wv-time-bucket-label', text: hour % 6 === 0 ? `${hour}` : '·' });
		}

		return wrap;
	}

	private getMetricZones(info: MetricInfo): Array<{ from: number; to: number; color: string }> {
		const GREEN = 'rgba(110, 196, 184, 0.14)';
		const GOLD = 'rgba(201, 162, 39, 0.12)';
		const RED = 'rgba(192, 106, 48, 0.12)';

		if (info.goodDirection === 'up') {
			return [
				{ from: 0.00, to: 0.28, color: RED },
				{ from: 0.28, to: 0.60, color: GOLD },
				{ from: 0.60, to: 1.00, color: GREEN },
			];
		}

		if (info.goodDirection === 'down') {
			return [
				{ from: 0.00, to: 0.40, color: GREEN },
				{ from: 0.40, to: 0.72, color: GOLD },
				{ from: 0.72, to: 1.00, color: RED },
			];
		}

		if (info.goodDirection === 'stable') {
			return [
				{ from: 0.00, to: 0.18, color: RED },
				{ from: 0.18, to: 0.34, color: GOLD },
				{ from: 0.34, to: 0.66, color: GREEN },
				{ from: 0.66, to: 0.82, color: GOLD },
				{ from: 0.82, to: 1.00, color: RED },
			];
		}

		return [];
	}

	// ── History Table ────────────────────────────────────

	private renderHistoryTable(container: Element, entries: ComputedMetricHistory[], info: MetricInfo, metricKey?: string) {
		const isD8 = metricKey === 'D8';
		const table = container.createEl('table', { cls: 'emerald-wv-table emerald-wv-history-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Date' });
		headerRow.createEl('th', { text: 'Value' });
		headerRow.createEl('th', { text: 'Change' });

		const tbody = table.createEl('tbody');

		// Show most recent first for the table
		const reversed = [...entries].reverse();

		for (let i = 0; i < reversed.length; i++) {
			const entry = reversed[i];
			const prevEntry = reversed[i + 1];
			const row = tbody.createEl('tr');

			row.createEl('td', { text: this.formatDateShort(entry.computed_at) });
			// Scale D8 values from 0-10 to 0-100 for display consistency
			const displayVal = entry.value !== null ? (isD8 ? entry.value * 10 : entry.value) : null;
			row.createEl('td', { text: displayVal !== null ? `${displayVal.toFixed(isD8 ? 0 : 2)}${info.unit}` : '—' });

			const changeCell = row.createEl('td');
			if (prevEntry && entry.value !== null && prevEntry.value !== null) {
				const rawDelta = entry.value - prevEntry.value;
				const displayDelta = isD8 ? rawDelta * 10 : rawDelta;
				if (Math.abs(displayDelta) < (isD8 ? 0.5 : 0.01)) {
					changeCell.createEl('span', { cls: 'emerald-wv-trend-flat', text: '—' });
				} else {
					const sign = displayDelta > 0 ? '+' : '';
					// Color based on whether direction is "good"
					let cls = 'emerald-wv-trend-flat';
					if (info.goodDirection === 'up') cls = displayDelta > 0 ? 'emerald-wv-trend-up' : 'emerald-wv-trend-down';
					else if (info.goodDirection === 'down') cls = displayDelta < 0 ? 'emerald-wv-trend-up' : 'emerald-wv-trend-down';

					changeCell.createEl('span', { cls, text: `${sign}${displayDelta.toFixed(isD8 ? 0 : 2)}` });
				}
			}
		}
	}

	// ── Pin Management ──────────────────────────────────

	private async togglePin(key: string, btn: HTMLElement) {
		if (this.pinnedKeys.has(key)) {
			this.pinnedKeys.delete(key);
			btn.textContent = '☆';
			btn.removeClass('is-pinned');
			new Notice(`${key} unpinned from sidebar`);
		} else {
			if (this.pinnedKeys.size >= 4) {
				new Notice('Maximum 4 pinned metrics. Unpin one first.');
				return;
			}
			this.pinnedKeys.add(key);
			btn.textContent = '★';
			btn.addClass('is-pinned');
			new Notice(`${key} pinned to sidebar`);
		}

		// Save to settings
		this.plugin.settings.pinnedMetricKeys = Array.from(this.pinnedKeys);
		await this.plugin.saveSettings();

		// Refresh note
		if (this.pinnedNoteText) {
			this.pinnedNoteText.textContent = `Sidebar sparklines: ${Array.from(this.pinnedKeys).join(', ')}. Click any metric's ★ to change.`;
		}

		// Tell the live sidebar EM component to re-render immediately
		window.dispatchEvent(new CustomEvent('emrald:pinned-metrics-changed'));
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

	// ── Expand/Collapse ─────────────────────────────────

	private toggleExpand(key: string) {
		if (this.expandedKeys.has(key)) {
			this.expandedKeys.delete(key);
		} else {
			this.expandedKeys.add(key);
		}
		this.renderAllCategories();
	}

	// ── Helpers ──────────────────────────────────────────

	private formatRelativeTime(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(hours / 24);

		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h ago`;
		if (days === 1) return 'yesterday';
		if (days < 7) return `${days}d ago`;
		return this.formatDate(iso);
	}

	private formatDateShort(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
}
