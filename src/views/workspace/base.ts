// EMRALD Workspace Views — Base class and constants.
// Each view is in its own file for maintainability.

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import EmraldPlugin from '../../../main';
import { tierState } from '../../tier';

// ── View Type Constants ─────────────────────────────────

export const VIEW_ELEVEL_OVERVIEW = 'emrald-elevel-overview';
export const VIEW_INSIGHT_LOG = 'emrald-insight-log';
export const VIEW_DATA_CENTER = 'emrald-data-center';
export const VIEW_EFFORT_PROFILE = 'emrald-effort-profile';
export const VIEW_BURNOUT_MONITOR = 'emrald-burnout-monitor';
export const VIEW_DIGEST = 'emrald-digest';
export const VIEW_ABOUT = 'emrald-about';

export const ALL_WORKSPACE_VIEWS = [
	VIEW_ELEVEL_OVERVIEW,
	VIEW_INSIGHT_LOG,
	VIEW_DATA_CENTER,
	VIEW_EFFORT_PROFILE,
	VIEW_BURNOUT_MONITOR,
	VIEW_DIGEST,
	VIEW_ABOUT
];

// ── Base Class ──────────────────────────────────────────

export abstract class EmraldWorkspaceView extends ItemView {
	protected plugin: EmraldPlugin;
	protected viewTitle: string;

	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin, title: string) {
		super(leaf);
		this.plugin = plugin;
		this.viewTitle = title;
	}

	getDisplayText(): string {
		return this.viewTitle;
	}

	getIcon(): string {
		return 'gem';
	}

	async onClose() {
		await Promise.resolve();
		this.containerEl.children[1].empty();
	}

	protected getContainer(): Element {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('emerald-workspace-view');
		return container;
	}

	protected renderHeader(container: Element, title: string, subtitle?: string, iconId?: string) {
		const header = container.createDiv({ cls: 'emerald-wv-header' });

		const titleRow = header.createDiv({ cls: 'emerald-wv-title-row' });
		if (iconId) {
			const iconEl = titleRow.createSpan({ cls: 'emerald-wv-icon' });
			setIcon(iconEl, iconId);
		}
		titleRow.createEl('h2', { text: title });

		// Refresh button
		const refreshBtn = titleRow.createEl('button', { cls: 'emerald-btn emerald-btn-subtle emerald-wv-refresh' });
		const refreshIcon = refreshBtn.createSpan({ cls: 'emerald-btn-icon' });
		setIcon(refreshIcon, 'refresh-cw');
		refreshBtn.createSpan({ text: 'Refresh' });
		refreshBtn.addEventListener('click', () => { void this.onOpen(); });

		if (subtitle) {
			header.createEl('p', { cls: 'emerald-wv-subtitle', text: subtitle });
		}
	}

	protected renderPlaceholder(container: Element, message: string) {
		container.createDiv({ cls: 'emerald-wv-placeholder', text: message });
	}

	protected renderError(container: Element, message: string) {
		const errEl = container.createDiv({ cls: 'emerald-wv-error' });
		const iconEl = errEl.createSpan({ cls: 'emerald-icon' });
		setIcon(iconEl, 'alert-triangle');
		errEl.createSpan({ text: ` ${message}` });
	}

	/**
	 * Render a subtle banner indicating data is from cache (offline/stale).
	 * P15 fix: users should know when they're seeing cached data.
	 */
	protected renderStaleBanner(container: Element) {
		const banner = container.createDiv({ cls: 'emerald-wv-stale-banner' });
		const iconEl = banner.createSpan({ cls: 'emerald-icon' });
		setIcon(iconEl, 'wifi-off');
		banner.createSpan({ text: ' Offline \u2014 showing cached data' });
	}

	/**
	 * Check if the plugin is currently offline.
	 */
	protected isOffline(): boolean {
		return this.plugin.offlineQueue ? !this.plugin.offlineQueue.isOnline : false;
	}

	protected renderLoading(container: Element) {
		container.createDiv({ cls: 'emerald-wv-loading', text: 'Loading...' });
	}

	protected formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = Math.round(minutes % 60);
		if (h === 0) return `${m}m`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	protected formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString();
	}

	protected formatDateTime(iso: string): string {
		return new Date(iso).toLocaleString();
	}

	/**
	 * Render a tasteful upgrade pitch card for free users on Pro-gated views.
	 * Returns true if the upgrade card was rendered (caller should stop), false if Pro user.
	 */
	protected renderUpgradeGate(container: Element, opts: {
		icon: string;
		title: string;
		description: string;
		features?: string[];
	}): boolean {
		if (tierState.isPro()) return false;

		const gate = container.createDiv({ cls: 'emerald-wv-upgrade-gate' });

		const iconEl = gate.createDiv({ cls: 'emerald-wv-upgrade-icon' });
		setIcon(iconEl, opts.icon);

		gate.createEl('h3', { cls: 'emerald-wv-upgrade-title', text: opts.title });
		gate.createEl('p', { cls: 'emerald-wv-upgrade-desc', text: opts.description });

		if (opts.features && opts.features.length > 0) {
			const list = gate.createEl('ul', { cls: 'emerald-wv-upgrade-features' });
			for (const feat of opts.features) {
				list.createEl('li', { text: feat });
			}
		}

		const cta = gate.createEl('a', {
			cls: 'emerald-btn emerald-btn-upgrade',
			text: 'Upgrade to PRO',
			href: 'https://app.effortmastery.com/app/billing'
		});
		cta.setAttribute('target', '_blank');

		return true;
	}
}
