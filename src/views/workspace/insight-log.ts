// EMRALD Insight Log — Full history of EMRALD-generated insights.
// Features: chronological list, filter by type, insight health indicator,
// expandable cards, source attribution, acknowledge actions.

import { WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_INSIGHT_LOG } from './base';
import { AIInsight } from '../../api/client';

const INSIGHT_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
	observation: { label: 'Observation', icon: 'eye', color: 'var(--interactive-accent)' },
	suggestion:  { label: 'Suggestion',  icon: 'lightbulb', color: 'var(--text-warning)' },
	warning:     { label: 'Warning',     icon: 'alert-triangle', color: 'var(--text-error)' },
	celebration: { label: 'Celebration', icon: 'party-popper', color: 'var(--text-success)' },
	discovery:   { label: 'Discovery',   icon: 'compass', color: 'var(--interactive-accent)' }
};

const INSIGHT_TYPES = ['all', 'observation', 'suggestion', 'warning', 'celebration', 'discovery'];

export class InsightLogView extends EmraldWorkspaceView {
	private allInsights: AIInsight[] = [];
	private filterType: string = 'all';
	private contentContainer: Element | null = null;
	private expandedIds: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'Insight log');
	}

	getViewType(): string { return VIEW_INSIGHT_LOG; }
	getIcon(): string { return 'lightbulb'; }

	private _ackListener?: () => void;
	private _ackSelf = false;

	async onOpen() {
		const container = this.getContainer();
		this.renderHeader(container, 'Insight log', 'Everything EMRALD has noticed', 'lightbulb');

		// Listen for insight acknowledgements from sidebar bulletin (bind once)
		if (!this._ackListener) {
			this._ackListener = () => { if (!this._ackSelf) this.refreshView(); };
			window.addEventListener('emrald:insight-acknowledged', this._ackListener);
		}

		// Pro gate — show upgrade pitch for free users
		if (this.renderUpgradeGate(container, {
			icon: 'lightbulb',
			title: 'Insight log',
			description: 'AI-powered observations, suggestions, and discoveries about your effort patterns — all in one place.',
			features: [
				'5 insight categories: observations, suggestions, warnings, celebrations, discoveries',
				'Chronological history with filter & search',
				'Actionable feedback throughout insights',
				'Pattern detection across your projects'
			]
		})) return;

		// Load data
		let resp;
		try {
			resp = await this.plugin.apiClient.getInsights(200);
		} catch {
			this.renderError(container, 'Could not load insights — check your connection.');
			return;
		}

		// Distinguish "no data yet" from "offline / unreachable" (P15 fix)
		if (resp.data === null || resp.data === undefined) {
			if (resp.status === 0 || resp.error) {
				this.renderError(container, 'Offline — insights will load when you reconnect.');
			} else {
				this.renderEmptyState(container);
			}
			return;
		}

		// Stale data banner when showing cached data offline (P15 fix)
		if (resp.fromCache || this.isOffline()) {
			this.renderStaleBanner(container);
		}

		if (resp.data.length === 0) {
			this.renderEmptyState(container);
			return;
		}

		this.allInsights = resp.data;

		// Insight Health Indicator (tit-for-tat)
		this.renderHealthIndicator(container);

		// Filter bar
		this.renderFilterBar(container);

		// Content area
		this.contentContainer = container.createDiv({ cls: 'emerald-wv-insight-list' });
		this.renderInsights();
	}

	// ── Empty State ─────────────────────────────────────

	private renderEmptyState(container: Element) {
		const empty = container.createDiv({ cls: 'emerald-wv-empty-state' });

		const iconEl = empty.createDiv({ cls: 'emerald-wv-empty-icon' });
		setIcon(iconEl, 'lightbulb');

		empty.createEl('h3', { text: 'No insights yet' });
		empty.createEl('p', {
			cls: 'emerald-wv-empty-desc',
			text: 'EMRALD generates insights as it learns your work patterns. The more sessions you complete and receipts you fill out, the smarter it gets.'
		});

		const checklist = empty.createDiv({ cls: 'emerald-wv-empty-checklist' });
		checklist.createDiv({ cls: 'emerald-wv-empty-check', text: '• Complete work sessions with effort receipts' });
		checklist.createDiv({ cls: 'emerald-wv-empty-check', text: '• Do energy check-ins' });
		checklist.createDiv({ cls: 'emerald-wv-empty-check', text: '• Use the system for a few days — patterns take time' });
	}

	// ── Summary Bar ─────────────────────────────────────

	private renderHealthIndicator(container: Element) {
		const totalInsights = this.allInsights.length;
		const acknowledged = this.allInsights.filter(i => i.acknowledged_at).length;
		const unread = totalInsights - acknowledged;

		const bar = container.createDiv({ cls: 'emerald-wv-insight-summary' });
		bar.createSpan({ text: `${totalInsights} insight${totalInsights !== 1 ? 's' : ''} · ${unread} new · ${acknowledged} reviewed` });
	}

	private refreshView() {
		const container = this.getContainer();
		container.empty();
		void this.onOpen();
	}

	// ── Filter Bar ──────────────────────────────────────

	private renderFilterBar(container: Element) {
		const bar = container.createDiv({ cls: 'emerald-wv-filter-bar' });

		for (const type of INSIGHT_TYPES) {
			const meta = type === 'all' ? null : INSIGHT_TYPE_META[type];
			const label = type === 'all' ? 'All' : (meta?.label ?? type);

			// Count for this type
			const count = type === 'all'
				? this.allInsights.length
				: this.allInsights.filter(i => i.type === type).length;

			const btn = bar.createEl('button', {
				cls: `emerald-wv-filter-btn ${type === this.filterType ? 'is-active' : ''} ${count === 0 ? 'is-empty' : ''}`,
				text: `${label} (${count})`
			});

			btn.addEventListener('click', () => {
				this.filterType = type;
				bar.querySelectorAll('.emerald-wv-filter-btn').forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
				this.renderInsights();
			});
		}
	}

	// ── Insight List ────────────────────────────────────

	private renderInsights() {
		if (!this.contentContainer) return;
		this.contentContainer.empty();

		const filtered = this.filterType === 'all'
			? this.allInsights
			: this.allInsights.filter(i => i.type === this.filterType);

		if (filtered.length === 0) {
			this.renderPlaceholder(this.contentContainer, `No ${this.filterType} insights yet.`);
			return;
		}

		// Count display
		this.contentContainer.createDiv({
			cls: 'emerald-wv-count',
			text: `${filtered.length} insight${filtered.length !== 1 ? 's' : ''}`
		});

		for (const insight of filtered) {
			this.renderInsightCard(this.contentContainer, insight);
		}
	}

	private renderInsightCard(container: Element, insight: AIInsight) {
		const isExpanded = this.expandedIds.has(insight.id);
		const isRead = !!insight.acknowledged_at;
		const isDismissed = insight.action_taken === 'acted';

		const card = container.createDiv({
			cls: `emerald-wv-insight-card emerald-fade-in ${isRead ? 'is-read' : 'is-unread'} ${isDismissed ? 'is-dismissed' : ''} ${isExpanded ? 'is-expanded' : ''}`
		});
		// Stagger animation based on position in list
		const cardIndex = container.querySelectorAll('.emerald-wv-insight-card').length - 1;
		card.style.animationDelay = `${cardIndex * 60}ms`;

		const meta = INSIGHT_TYPE_META[insight.type] ?? INSIGHT_TYPE_META.observation;

		// ── Top Row: type badge + metric tag + date ──
		const topRow = card.createDiv({ cls: 'emerald-wv-insight-top' });

		const typeBadge = topRow.createSpan({ cls: 'emerald-wv-insight-type-badge' });
		const typeIcon = typeBadge.createSpan({ cls: 'emerald-wv-insight-type-icon' });
		setIcon(typeIcon, meta.icon);
		typeBadge.createSpan({ text: meta.label });

		// Removed D-metric tag from top row per feedback (it stays in source line below)

		topRow.createSpan({
			cls: 'emerald-wv-insight-date',
			text: this.formatRelativeTime(insight.created_at)
		});

		// ── Title (clickable to expand) ──
		const titleRow = card.createDiv({ cls: 'emerald-wv-insight-title-row' });
		const titleEl = titleRow.createDiv({ cls: 'emerald-wv-insight-title' });
		titleEl.addClass('emrald-clickable');
		titleEl.createSpan({ text: insight.title });
		if (!isRead) {
			titleRow.createSpan({ cls: 'emerald-wv-insight-new-pill', text: 'NEW' });
		}
		
		const chevron = titleEl.createSpan({ 
			cls: 'emerald-wv-insight-chevron',
			text: isExpanded ? ' ▾' : ' ▸'
		});
		chevron.addClass('emrald-insight-chevron-style');

		titleRow.addEventListener('click', () => {
			if (this.expandedIds.has(insight.id)) {
				this.expandedIds.delete(insight.id);
			} else {
				this.expandedIds.add(insight.id);
			}
			this.renderInsights();
		});

		// ── Collapsed preview removed per feedback ──

		// ── Expanded body ──
		if (isExpanded) {
			// Full body
			if (insight.body) {
				card.createDiv({ cls: 'emerald-wv-insight-body', text: insight.body });
			}

			// Source line
			if (insight.related_metric) {
				const sourceEl = card.createDiv({ cls: 'emerald-wv-insight-source' });
				sourceEl.createSpan({ text: `Source: ${insight.related_metric} analysis` });
				if (insight.related_item_id) {
					sourceEl.createSpan({ text: ' · Project-specific' });
				}
			}

			// Full timestamp
			card.createDiv({
				cls: 'emerald-wv-insight-timestamp',
				text: this.formatDateTime(insight.created_at)
			});
		}

		// ── Actions ──
		const actions = card.createDiv({ cls: 'emerald-wv-insight-actions' });

		if (!isRead) {
			const gotItBtn = actions.createEl('button', { cls: 'emerald-btn-tiny', text: '✓ got it' });
			gotItBtn.addEventListener('click', (e) => { void (async () => {
				try {
					e.stopPropagation();
					const resp = await this.plugin.apiClient.acknowledgeInsight(insight.id, 'dismissed');
					if (!resp.error) {
						insight.acknowledged_at = new Date().toISOString();
						new Notice('Insight acknowledged');
						this.refreshView();
						// Notify sidebar EM component to refresh badge + bulletin
						this._ackSelf = true;
						window.dispatchEvent(new CustomEvent('emrald:insight-acknowledged', { detail: { id: insight.id } }));
						this._ackSelf = false;
					}
				} catch { /* non-fatal */ }
			})(); });
		}
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
		if (days < 30) return `${Math.floor(days / 7)}w ago`;
		return this.formatDate(iso);
	}
}
