// EMRALD Burnout Monitor — Caring coach, not clinical report.
// Structure: NOW (hero) → PAST (what's driving this) → FUTURE (suggestions)
// → Recovery sparkline (collapsed). Episodes tucked at bottom.
// Warm language, minimal data, emotionally effective.

import { WorkspaceLeaf, Notice, Modal, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_BURNOUT_MONITOR, VIEW_EFFORT_PROFILE } from './base';
import { RecoveryProtocol } from '../../api/client';

// Phase descriptions — qualitative, warm, human
const PHASE_META: Record<string, { label: string; icon: string; message: string; tone: string }> = {
	green: {
		label: 'All Clear',
		icon: 'sun',
		message: 'You\'re in a good place. Your effort patterns look healthy and sustainable. Keep doing what you\'re doing.',
		tone: 'Your energy reserves are solid.'
	},
	yellow: {
		label: 'Worth Watching',
		icon: 'cloud',
		message: 'Some signals suggest you might be pushing a bit hard. Nothing urgent — just keep an eye on your recharge.',
		tone: 'A little wear showing — normal, but worth noticing.'
	},
	orange: {
		label: 'Slow Down',
		icon: 'cloud-rain',
		message: 'Multiple indicators suggest you\'re running hot. Consider lighter sessions, more breaks, or activities that recharge you.',
		tone: 'Your effort debt is accumulating faster than you\'re recovering.'
	},
	red: {
		label: 'Recharge Needed',
		icon: 'cloud-lightning',
		message: 'Your patterns strongly suggest burnout risk. Please prioritize rest and recharge. This isn\'t a failure — it\'s your body asking for what it needs.',
		tone: 'This is important. Take care of yourself first.'
	}
};

// Sparkline constants
const SPARK_W = 200;
const SPARK_H = 32;

export class BurnoutMonitorView extends EmraldWorkspaceView {
	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'Burnout Monitor');
	}

	getViewType(): string { return VIEW_BURNOUT_MONITOR; }

	async onOpen() {
		const container = this.getContainer();
		this.renderHeader(container, 'Burnout Monitor', 'How you\'re really doing', 'flame');

		// Fetch data concurrently
		let burnoutResp, metricsResp, historyResp, recoveryResp, d8CurrentResp;
		try {
			[burnoutResp, metricsResp, historyResp, recoveryResp, d8CurrentResp] = await Promise.all([
				this.plugin.apiClient.getBurnoutState(),
				this.plugin.apiClient.getMetricHistory('D8'),
				this.plugin.apiClient.getBurnoutHistory(),
				this.plugin.apiClient.getRecoveryProtocols(),
				this.plugin.apiClient.getMetrics(['D8'])
			]);
		} catch (e) {
			this.renderError(container, 'Could not load burnout data — check your connection.');
			return;
		}

		const recoveryProtocols = (recoveryResp.data ?? []) as RecoveryProtocol[];
		const hasRecoveryActivities = recoveryProtocols.filter(p => p.is_active !== false).length > 0;

		// Offline: if burnout + metrics both failed with no cache, show offline message (P15 fix)
		if (!burnoutResp.data && !d8CurrentResp?.data && (burnoutResp.status === 0 || burnoutResp.error)) {
			this.renderError(container, 'Offline — burnout data will load when you reconnect.');
			return;
		}

		// Stale data banner when showing cached data offline (P15 fix)
		const anyFromCache = burnoutResp.fromCache || metricsResp.fromCache || d8CurrentResp?.fromCache;
		if (anyFromCache || this.isOffline()) {
			this.renderStaleBanner(container);
		}

		// Normalize burnout state: API may return raw DB row or structured BurnoutState.
		// Derive phase + score from D8 metric (source of truth), episode info from burnout_state row.
		const rawState = burnoutResp.data as Record<string, unknown> | null;
		const d8Metric = d8CurrentResp?.data?.find((m: any) => m.metric_key === 'D8');
		const d8Value = d8Metric?.value ?? null;
		const d8Meta = d8Metric?.metadata as Record<string, unknown> | undefined;

		// Derive phase from D8 value (0-10 scale)
		let currentPhase: string;
		if (rawState?.current_phase && typeof rawState.current_phase === 'string') {
			currentPhase = rawState.current_phase; // API already provides it
		} else if (d8Value !== null) {
			if (d8Value >= 7) currentPhase = 'red';
			else if (d8Value >= 5) currentPhase = 'orange';
			else if (d8Value >= 3) currentPhase = 'yellow';
			else currentPhase = 'green';
		} else {
			currentPhase = 'green';
		}

		// Score: scale D8 (0-10) to display (0-100)
		const score = d8Value !== null ? d8Value * 10 : (typeof rawState?.score === 'number' ? rawState.score : 0);

		// Contributing factors: from D8 metadata signal_breakdown or raw state
		let factors: string[] = [];
		if (rawState && Array.isArray(rawState.contributing_factors)) {
			factors = rawState.contributing_factors as string[];
		} else if (d8Meta?.signal_breakdown && typeof d8Meta.signal_breakdown === 'object') {
			// Convert signal_breakdown { rising_effort: 2, declining_valence: 0, ... } to readable strings
			const signals = d8Meta.signal_breakdown as Record<string, number>;
			const SIGNAL_LABELS: Record<string, string> = {
				rising_effort: 'Rising perceived effort',
				declining_valence: 'Declining work enjoyment',
				context_switches: 'High demand-investment imbalance',
				low_flow: 'Low flow frequency',
				emotional_skew: 'Emotional effort dominance'
			};
			for (const [key, val] of Object.entries(signals)) {
				if (val > 0 && SIGNAL_LABELS[key]) {
					factors.push(SIGNAL_LABELS[key]);
				}
			}
		}

		const normalizedState = { current_phase: currentPhase, score, contributing_factors: factors };

		// ── NOW: Current State (Hero) ──
		if (d8Value !== null || rawState) {
			this.renderHero(container, normalizedState);
		} else {
			this.renderEmptyState(container);
			this.renderCrossLink(container);
			return;
		}

		// Cross-link (always visible, right after hero)
		this.renderCrossLink(container);

		// ── PAST: What's Driving This ──
		if (factors.length > 0) {
			this.renderFactors(container, factors, currentPhase);
		}

		// ── FUTURE: Suggestions ──
		this.renderSuggestions(container, currentPhase, hasRecoveryActivities);

		// ── Recovery Sparkline (collapsed) ──
		const d8History = metricsResp.data ?? [];
		if (d8History.length > 1) {
			this.renderRecoverySparkline(container, d8History);
		}

		// ── Past Episodes (tucked away) ──
		// History API returns raw burnout_state rows — normalize to episode shape
		const rawEpisodes = historyResp.data ?? [];
		const episodes = rawEpisodes
			.filter((e: any) => e.episode_started_at || e.started_at) // Only rows with episode data
			.map((e: any) => ({
				started_at: e.started_at ?? e.episode_started_at ?? null,
				resolved_at: e.resolved_at ?? null,
				peak_phase: e.peak_phase ?? this.escalationToPhase(e.escalation_level),
				contributing_factors: Array.isArray(e.contributing_factors) ? e.contributing_factors : []
			}));
		if (episodes.length > 0) {
			this.renderEpisodesCollapsed(container, episodes);
		}
	}

	private renderCrossLink(container: Element) {
		const link = container.createEl('div', { cls: 'emerald-wv-cross-link' });
		const anchor = link.createEl('a', {
			cls: 'emerald-wv-cross-link-text',
			text: 'Review your recharge activities \u2192'
		});
		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			this.plugin.openWorkspaceView(VIEW_EFFORT_PROFILE);
		});
	}

	// ── Empty State ─────────────────────────────────────

	private renderEmptyState(container: Element) {
		const empty = container.createEl('div', { cls: 'emerald-wv-empty-state' });
		const iconEl = empty.createEl('div', { cls: 'emerald-wv-empty-icon' });
		setIcon(iconEl, 'flame');
		empty.createEl('h3', { text: 'Not enough data yet' });
		empty.createEl('p', {
			cls: 'emerald-wv-empty-desc',
			text: 'The Burnout Monitor needs session data and effort receipts to understand your patterns. Complete a few work sessions and this dashboard will come alive.'
		});
	}

	// ── NOW: Hero ───────────────────────────────────────

	private renderHero(container: Element, state: { current_phase: string; score: number; contributing_factors: string[] }) {
		const meta = PHASE_META[state.current_phase] ?? PHASE_META.green;
		const section = container.createEl('div', { cls: `emerald-wv-section emerald-wv-burnout-hero emerald-wv-burnout-hero-${state.current_phase}` });

		// Phase icon + label
		const phaseRow = section.createEl('div', { cls: 'emerald-wv-burnout-phase-row' });
		const iconEl = phaseRow.createEl('span', { cls: 'emerald-wv-burnout-hero-icon' });
		setIcon(iconEl, meta.icon);
		phaseRow.createEl('span', { cls: 'emerald-wv-burnout-phase-label', text: meta.label });

		// Main message
		section.createEl('p', { cls: 'emerald-wv-burnout-message', text: meta.message });

		// Tone line
		section.createEl('p', { cls: 'emerald-wv-burnout-tone', text: meta.tone });

		// D8 score (understated)
		const score = typeof state.score === 'number' ? state.score : 0;
		const scoreRow = section.createEl('div', { cls: 'emerald-wv-burnout-score-row' });
		const scoreLabelWrap = scoreRow.createEl('span', { cls: 'emerald-wv-burnout-score-label-wrap' });
		scoreLabelWrap.createEl('span', { cls: 'emerald-wv-burnout-score-label', text: 'D8 Burnout Risk Score' });

		// ⓘ explainer tooltip
		const infoBtn = scoreLabelWrap.createEl('span', {
			cls: 'emerald-wv-burnout-score-info',
			attr: { 'aria-label': 'About this score' }
		});
		setIcon(infoBtn, 'info');
		const infoDetail = section.createEl('div', {
			cls: 'emerald-wv-burnout-score-explainer',
			text: '0 = no risk signals detected. 100 = multiple burnout indicators active. Combines rising effort, declining enjoyment, low flow, emotional strain, and demand imbalance over the past 14 days.'
		});
		infoDetail.style.display = 'none';
		infoBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const visible = infoDetail.style.display !== 'none';
			infoDetail.style.display = visible ? 'none' : 'block';
		});
		const barOuter = scoreRow.createEl('div', { cls: 'emerald-wv-burnout-score-bar' });
		const barFill = barOuter.createEl('div', {
			cls: `emerald-wv-burnout-score-fill emerald-wv-bar-${state.current_phase}`
		});
		barFill.style.width = `${Math.min(score, 100)}%`;
		scoreRow.createEl('span', { cls: 'emerald-wv-burnout-score-num', text: `${score.toFixed(0)}/100` });
	}

	// ── PAST: What's Driving This ───────────────────────

	private renderFactors(container: Element, factors: string[], phase: string) {
		const section = container.createEl('div', { cls: 'emerald-wv-section' });
		section.createEl('h3', { text: 'What\'s driving this' });

		const intro = phase === 'green'
			? 'These are the factors EMRALD is watching — all looking fine right now.'
			: 'These factors are contributing to your current state:';
		section.createEl('p', { cls: 'emerald-wv-factors-intro', text: intro });

		const list = section.createEl('div', { cls: 'emerald-wv-factors-list' });
		for (const factor of factors) {
			const row = list.createEl('div', { cls: 'emerald-wv-factor-row' });
			const dot = row.createEl('span', { cls: 'emerald-wv-factor-indicator' });
			dot.style.background = this.getPhaseColor(phase);
			row.createEl('span', { text: factor });
		}
	}

	// ── FUTURE: Suggestions ─────────────────────────────

	private renderSuggestions(container: Element, phase: string, hasRecoveryActivities: boolean = false) {
		const section = container.createEl('div', { cls: 'emerald-wv-section' });
		section.createEl('h3', { text: 'What you can do' });

		// Phase-aware suggestions
		const suggestions = this.getSuggestionsForPhase(phase, hasRecoveryActivities);

		for (const sug of suggestions) {
			const row = section.createEl('div', { cls: 'emerald-wv-suggestion-row' });
			const iconEl = row.createEl('span', { cls: 'emerald-wv-suggestion-bullet' });
			setIcon(iconEl, sug.icon);
			row.createEl('span', { text: sug.text });
		}

		if (phase === 'green') {
			section.createEl('p', {
				cls: 'emerald-wv-suggestion-note',
				text: 'No action needed right now. These suggestions will become more specific as EMRALD learns your patterns.'
			});
		}
	}

	private getSuggestionsForPhase(phase: string, hasRecoveryActivities: boolean = false): Array<{ icon: string; text: string }> {
		switch (phase) {
			case 'green': {
				const recoverySuggestion = hasRecoveryActivities
					? { icon: 'check-circle', text: 'Your recharge activities are being tracked — EMRALD is learning what recharges you.' }
					: { icon: 'calendar', text: 'Consider logging recharge activities so EMRALD can learn what recharges you.' };
				return [
					{ icon: 'check', text: 'Keep your current rhythm — it\'s working.' },
					recoverySuggestion
				];
			}
			case 'yellow':
				return [
					{ icon: 'pause', text: 'Try shorter sessions this week.' },
					{ icon: 'coffee', text: 'Schedule deliberate breaks between sessions.' },
					{ icon: 'moon', text: 'Prioritize sleep — it\'s your fastest recovery lever.' }
				];
			case 'orange':
				return [
					{ icon: 'arrow-down', text: 'Consider dropping one E-level on your heaviest project.' },
					{ icon: 'heart', text: 'Do something that recharges you today — not productive, just enjoyable.' },
					{ icon: 'calendar-x', text: 'If you can cancel or reschedule non-essential commitments, do it.' }
				];
			case 'red':
				return [
					{ icon: 'shield', text: 'Take a full rest day. Not a light day — a real rest day.' },
					{ icon: 'heart', text: 'Reach out to someone you trust. Burnout is easier with support.' },
					{ icon: 'pause-circle', text: 'Pause non-essential projects. They\'ll be there when you\'re ready.' }
				];
			default:
				return [];
		}
	}

	// ── Recovery Sparkline (collapsed) ──────────────────

	private renderRecoverySparkline(container: Element, history: Array<{ value: number | null; computed_at: string }>) {
		const section = container.createEl('div', { cls: 'emerald-wv-section emerald-wv-burnout-sparkline-section' });

		const headerRow = section.createEl('div', { cls: 'emerald-wv-burnout-spark-header' });
		headerRow.createEl('span', { cls: 'emerald-wv-burnout-spark-label', text: 'Burnout risk trend' });

		// Deduplicate by date (keep latest entry per day)
		const byDate = new Map<string, { value: number | null; computed_at: string }>();
		for (const entry of history) {
			const dateKey = entry.computed_at.split('T')[0];
			if (!byDate.has(dateKey) || entry.computed_at > byDate.get(dateKey)!.computed_at) {
				byDate.set(dateKey, entry);
			}
		}
		const dedupedHistory = Array.from(byDate.values()).sort((a, b) => b.computed_at.localeCompare(a.computed_at));

		// Build sparkline SVG
		const entries = dedupedHistory.slice(0, 14).reverse();
		const values = entries.map(e => (e.value ?? 0) * 10); // Scale D8 (0-10) to 0-100 for display
		const sparkSvg = this.buildSparklineSVG(values);
		headerRow.appendChild(sparkSvg);

		// Current value + info tooltip
		const latest = history[0];
		if (latest?.value !== null) {
			const displayVal = Math.round(latest!.value! * 10); // D8 is 0-10, display as 0-100
			headerRow.createEl('span', {
				cls: 'emerald-wv-burnout-spark-value',
				text: `${displayVal}/100`
			});
		}

		// ⓘ explainer for the trendline score
		const sparkInfo = headerRow.createEl('span', {
			cls: 'emerald-wv-burnout-score-info',
			attr: { 'aria-label': 'About this trend' }
		});
		setIcon(sparkInfo, 'info');
		const sparkExplainer = section.createEl('div', {
			cls: 'emerald-wv-burnout-score-explainer',
			text: 'This tracks your D8 Burnout Risk Score over time. Each point is the daily score (0–100). A flat line near 0 means no risk signals. Rising trends mean burnout indicators are accumulating.'
		});
		sparkExplainer.style.display = 'none';
		sparkInfo.addEventListener('click', (e) => {
			e.stopPropagation();
			const visible = sparkExplainer.style.display !== 'none';
			sparkExplainer.style.display = visible ? 'none' : 'block';
		});

		// Toggle to expand
		const toggleBtn = section.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle emerald-btn-sm emerald-wv-burnout-expand-btn',
			text: 'Show full trendline ▼'
		});

		let expanded = false;
		const chartContainer = section.createEl('div', { cls: 'emerald-wv-burnout-full-chart' });
		chartContainer.style.display = 'none';

		toggleBtn.addEventListener('click', () => {
			expanded = !expanded;
			chartContainer.style.display = expanded ? 'block' : 'none';
			toggleBtn.textContent = expanded ? 'Hide trendline ▲' : 'Show full trendline ▼';

			if (expanded && chartContainer.childElementCount === 0) {
				this.renderFullTrendline(chartContainer, entries);
			}
		});
	}

	private buildSparklineSVG(values: number[]): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', String(SPARK_W));
		svg.setAttribute('height', String(SPARK_H));
		svg.setAttribute('viewBox', `0 0 ${SPARK_W} ${SPARK_H}`);
		svg.classList.add('emerald-wv-burnout-spark-svg');

		if (values.length < 2) return svg;

		const min = Math.min(...values);
		const max = Math.max(...values);
		const range = max - min || 1;
		const pad = 3;
		const step = SPARK_W / (values.length - 1);

		const points: string[] = [];
		for (let i = 0; i < values.length; i++) {
			const x = i * step;
			const normalized = (values[i] - min) / range;
			const y = (SPARK_H - pad) - normalized * (SPARK_H - pad * 2);
			points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
		}

		const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		polyline.setAttribute('points', points.join(' '));
		polyline.classList.add('emerald-sparkline-line');
		svg.appendChild(polyline);

		// Endpoint dot
		const lastPt = points[points.length - 1].split(',');
		const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		dot.setAttribute('cx', lastPt[0]);
		dot.setAttribute('cy', lastPt[1]);
		dot.setAttribute('r', '2.5');
		dot.classList.add('emerald-sparkline-dot');
		svg.appendChild(dot);

		return svg;
	}

	private renderFullTrendline(container: Element, entries: Array<{ value: number | null; computed_at: string }>) {
		// SVG bar chart (expanded view)
		const chartHeight = 100;
		const chartWidth = Math.min(entries.length * 40, 560);
		const barWidth = Math.max(Math.floor(chartWidth / entries.length) - 6, 8);
		const maxVal = Math.max(...entries.map(e => e.value ?? 0), 10);

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', String(chartWidth));
		svg.setAttribute('height', String(chartHeight + 24));
		svg.setAttribute('viewBox', `0 0 ${chartWidth} ${chartHeight + 24}`);
		svg.classList.add('emerald-wv-burnout-chart');

		for (let i = 0; i < entries.length; i++) {
			const val = entries[i].value ?? 0;
			const barH = maxVal > 0 ? (val / maxVal) * (chartHeight - 4) : 0;
			const x = i * (chartWidth / entries.length) + (chartWidth / entries.length - barWidth) / 2;
			const y = chartHeight - barH;

			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', String(x));
			rect.setAttribute('y', String(y));
			rect.setAttribute('width', String(barWidth));
			rect.setAttribute('height', String(Math.max(barH, 1)));
			rect.setAttribute('rx', '2');

			if (val >= 70) rect.classList.add('emerald-chart-bar-red');
			else if (val >= 50) rect.classList.add('emerald-chart-bar-orange');
			else if (val >= 30) rect.classList.add('emerald-chart-bar-yellow');
			else rect.classList.add('emerald-chart-bar-green');
			svg.appendChild(rect);

			const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('x', String(x + barWidth / 2));
			label.setAttribute('y', String(chartHeight + 16));
			label.setAttribute('text-anchor', 'middle');
			label.classList.add('emerald-chart-label');
			const date = new Date(entries[i].computed_at);
			label.textContent = `${date.getMonth() + 1}/${date.getDate()}`;
			svg.appendChild(label);
		}

		container.appendChild(svg);

		// Trend summary
		if (entries.length >= 3) {
			const recent = entries.slice(-3).map(e => e.value ?? 0);
			const older = entries.slice(0, 3).map(e => e.value ?? 0);
			const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
			const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
			const delta = recentAvg - olderAvg;

			let trendText: string;
			if (Math.abs(delta) < 2) trendText = 'Your burnout risk has been stable.';
			else if (delta > 0) trendText = `Trending up (+${delta.toFixed(0)} pts). Pay attention to recovery.`;
			else trendText = `Trending down (${delta.toFixed(0)} pts). Nice work.`;

			container.createEl('p', { cls: 'emerald-wv-burnout-trend-summary', text: trendText });
		}
	}

	// ── Past Episodes (collapsed toggle) ────────────────

	private renderEpisodesCollapsed(container: Element, episodes: Array<{ started_at: string; resolved_at: string | null; peak_phase: string; contributing_factors: string[] }>) {
		const section = container.createEl('div', { cls: 'emerald-wv-section' });

		const toggleBtn = section.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle emerald-btn-sm',
			text: `Past Episodes (${episodes.length}) ▼`
		});

		const listContainer = section.createEl('div', { cls: 'emerald-wv-burnout-episodes-list' });
		listContainer.style.display = 'none';

		let expanded = false;
		toggleBtn.addEventListener('click', () => {
			expanded = !expanded;
			listContainer.style.display = expanded ? 'block' : 'none';
			toggleBtn.textContent = expanded
				? `Past Episodes (${episodes.length}) ▲`
				: `Past Episodes (${episodes.length}) ▼`;
		});

		for (const episode of episodes) {
			const card = listContainer.createEl('div', { cls: 'emerald-wv-episode-card' });
			const topRow = card.createEl('div', { cls: 'emerald-wv-episode-top' });

			const peakPhase = typeof episode.peak_phase === 'string' && episode.peak_phase.length > 0
				? episode.peak_phase
				: 'unknown';
			const peakLabel = peakPhase.charAt(0).toUpperCase() + peakPhase.slice(1);
			const badge = topRow.createEl('span', { cls: `emerald-wv-episode-badge emerald-wv-bg-${peakPhase}` });
			badge.createEl('span', { text: `Peak: ${peakLabel}` });

			const started = this.formatDateShort(episode.started_at);
			const resolved = episode.resolved_at ? this.formatDateShort(episode.resolved_at) : 'ongoing';
			let dateText: string | null = null;
			if (started && resolved) {
				dateText = `${started} → ${resolved}`;
			} else if (started) {
				dateText = episode.resolved_at ? started : `${started} → ongoing`;
			} else if (resolved && resolved !== 'ongoing') {
				dateText = `Resolved ${resolved}`;
			} else if (!started && !episode.resolved_at) {
				dateText = 'Dates unavailable';
			}
			if (dateText) {
				topRow.createEl('span', { cls: 'emerald-wv-episode-dates', text: dateText });
			}

			const factors = Array.isArray(episode.contributing_factors) ? episode.contributing_factors.filter(Boolean) : [];
			if (factors.length > 0) {
				card.createEl('div', { cls: 'emerald-wv-episode-factors', text: factors.join(' · ') });
			}
		}
	}

	// ── Helpers ──────────────────────────────────────────

	private getPhaseColor(phase: string): string {
		switch (phase) {
			case 'green': return 'var(--text-success)';
			case 'yellow': return 'var(--text-warning)';
			case 'orange': return '#e68a00';
			case 'red': return 'var(--text-error)';
			default: return 'var(--text-muted)';
		}
	}

	private formatDateShort(iso: string | null | undefined): string | null {
		if (!iso || typeof iso !== 'string') return null;
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	/** Map burnout_state.escalation_level to a display phase */
	private escalationToPhase(level: string | null | undefined): string {
		switch (level) {
			case 'first_warning': return 'yellow';
			case 'backed_off': return 'orange';
			default: return 'yellow'; // Episodes are at least yellow
		}
	}
}
