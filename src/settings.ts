import { App, Notice, PluginSettingTab, Setting, setTooltip } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import EmraldPlugin from '../main';
import type { CustomELevel } from './api/client';
import { tierState } from './tier';
import {
	CUSTOM_BADGE,
	assumeReferenced,
	colorForPercent,
	eLevelStore,
	levelTooltip,
	refCountLabel
} from './e-levels';

export interface EmraldSettings {
	// Auth
	apiKey: string;
	apiUrl: string;

	// Folders
	activeFolderPath: string;
	inactiveFolderPath: string;
	autoDetectNotes: boolean;
	autoDetectMoves: boolean;

	// Timeblock
	showOvertime: boolean;

	// Notifications
	burnoutModalEnabled: boolean;
	insightRotationSeconds: number;

	// Display
	pinnedMetricKeys: string[];
	timerStyle: 'digital' | 'analog' | 'timetimer';

	// Data
	syncIntervalMinutes: number;
	frontmatterEnabled: boolean;
	debugLogging: boolean;

	// Onboarding
	onboardingComplete: boolean;
	tourDismissed: boolean;
	advancedProfileCompleted: boolean;

	// Install tracking
	installId: string;
	installPinged: boolean;

	// Timezone auto-sync (S102 follow-on) — one-shot flag; set true after we've
	// successfully PATCHed user_profile.timezone with the detected IANA name.
	timezoneSynced: boolean;

	// Celebration (first receipt)
	celebrationShown: boolean;

	// Privacy
	researchOptIn: boolean;

	// Digest
	digestDay: 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
	digestTime: string; // HH:MM format
}

export const DEFAULT_SETTINGS: EmraldSettings = {
	apiKey: '',
	apiUrl: 'https://api.effortmastery.com/v1',
	activeFolderPath: 'Active',
	inactiveFolderPath: 'Inactive',
	autoDetectNotes: true,
	autoDetectMoves: true,
	showOvertime: true,
	burnoutModalEnabled: true,
	insightRotationSeconds: 15,
	pinnedMetricKeys: ['D1', 'D8', 'D12', 'D3'],
	timerStyle: 'digital',
	syncIntervalMinutes: 5,
	frontmatterEnabled: true,
	debugLogging: false,
	onboardingComplete: false,
	tourDismissed: false,
	advancedProfileCompleted: false,
	installId: '',
	installPinged: false,
	timezoneSynced: false,
	celebrationShown: false,
	researchOptIn: false,
	digestDay: 'sunday',
	digestTime: '09:00'
};

const TIMER_STYLE_OPTIONS: Record<string, string> = {
	digital: 'Digital',
	analog: 'Analog (post-mvp)',
	timetimer: 'Time timer (post-mvp)'
};

const DIGEST_DAY_OPTIONS: Record<string, string> = {
	sunday: 'Sunday',
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
	friday: 'Friday',
	saturday: 'Saturday'
};

function digestTimeOptions(): Record<string, string> {
	const options: Record<string, string> = {};
	for (let h = 0; h < 24; h++) {
		const label = `${String(h).padStart(2, '0')}:00`;
		options[label] = label;
	}
	return options;
}

const RESEARCH_OPT_IN_DESC =
	'Effort management is a new field, and every data point helps make it better. ' +
	'Your anonymized usage patterns (never notes, names, or identifiers) help us build smarter ' +
	'features and may be used in published research by Effort Mastery LLC. You can change this anytime.';

const EXPORT_DESC =
	"Download all your EMRALD data as a JSON file. The file saves to your vault's root folder on disk — it won't appear in Obsidian's file explorer since .json files aren't indexed. Free tier: 90-day history + D1-D8 metrics. Pro: everything.";

const ELEVEL_MANAGE_HEADING = 'Manage effort levels';
const PRO_UPGRADE_URL = 'https://effortmastery.com/pro';
const PRO_REQUIRED_NOTICE = `Custom e-levels are a PRO feature. Upgrade at ${PRO_UPGRADE_URL}`;
const ELEVEL_ANCHOR_CLASS = 'emerald-elevel-manage-anchor';
const ELEVEL_EMPTY_STATE =
	'No custom levels yet. Create one to prescribe a share of your day that E1-E4 does not cover.';
const ELEVEL_PRO_PITCH =
	'Custom e-levels are a Pro feature. Name your own effort levels at any percent of your daily work time — EMRALD prescribes time, tracks overtime, and colours them just like E1-E4.';

export class EmraldSettingTab extends PluginSettingTab {
	plugin: EmraldPlugin;

	/** Guards the network refresh kicked off from update(). */
	private refreshingTabState = false;

	constructor(app: App, plugin: EmraldPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// ── P1: declarative settings (Obsidian 1.13.0+) ─────
	// Declarative settings (Obsidian 1.13+, minAppVersion-gated): what the app
	// renders and indexes for settings search. The legacy imperative display()
	// twin was removed when minAppVersion moved to 1.13.0.
	//
	// Kept cheap on purpose: no I/O, no network. The custom-level list is read
	// from the in-memory store; refreshing it happens in update().

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: 'Account',
				items: [
					{
						name: 'API key',
						desc: 'Your EMRALD API key from effortmastery.com',
						// render, not a text control: the input needs type=password.
						render: (setting: Setting) => { this.renderApiKeyControl(setting); }
					},
					{
						name: 'API URL',
						desc: 'EMRALD API endpoint',
						control: { type: 'text', key: 'apiUrl' }
					},
					{
						name: 'Connection status',
						desc: 'Testing...',
						render: (setting: Setting) => { this.renderConnectionStatus(setting); }
					}
				]
			},
			{
				type: 'group',
				heading: 'Timeblock',
				items: [
					{
						name: 'Show overtime indicator',
						desc: 'Yellow bar + counter when exceeding daily hours',
						control: { type: 'toggle', key: 'showOvertime' }
					}
				]
			},
			...this.eLevelDefinitions(),
			{
				type: 'group',
				heading: 'Notifications',
				items: [
					{
						name: 'Burnout warning modals',
						desc: 'Show burnout warning modals when d8 crosses threshold',
						control: { type: 'toggle', key: 'burnoutModalEnabled' }
					},
					{
						name: 'Insight rotation speed',
						desc: 'Seconds between rotating bulletin cards (5-60)',
						control: { type: 'slider', key: 'insightRotationSeconds', min: 5, max: 60, step: 5 }
					}
				]
			},
			{
				type: 'group',
				heading: 'Display',
				items: [
					{
						name: 'Timer style',
						desc: 'How the session timer is displayed',
						control: { type: 'dropdown', key: 'timerStyle', defaultValue: 'digital', options: TIMER_STYLE_OPTIONS }
					}
				]
			},
			{
				type: 'group',
				heading: 'Data',
				items: [
					{
						name: 'Frontmatter sync',
						desc: 'Write EMRALD metadata to note frontmatter',
						control: { type: 'toggle', key: 'frontmatterEnabled' }
					},
					{
						name: 'Debug logging',
						desc: 'Log API calls and state changes to console',
						control: { type: 'toggle', key: 'debugLogging' }
					},
					{
						name: 'Offline queue status',
						desc: this.queueStatusDesc(),
						render: (setting: Setting) => { this.renderQueueStatus(setting); }
					}
				]
			},
			...this.pendingQueueDefinitions(),
			{
				type: 'group',
				heading: 'Privacy',
				items: [
					{
						name: 'Help improve EMRALD',
						desc: RESEARCH_OPT_IN_DESC,
						// render, not a toggle control: flipping it also PATCHes
						// /preferences and shows a confirmation notice.
						render: (setting: Setting) => { this.renderResearchOptIn(setting); }
					}
				]
			},
			{
				type: 'group',
				heading: 'Digest',
				items: [
					{
						name: 'Digest delivery day',
						desc: 'Day of the week your weekly digest is generated',
						control: { type: 'dropdown', key: 'digestDay', defaultValue: 'sunday', options: DIGEST_DAY_OPTIONS }
					},
					{
						name: 'Digest delivery time',
						desc: 'Hour of day in UTC (e.g. 09:00 = 4am est). Digests run on the hour.',
						control: { type: 'dropdown', key: 'digestTime', defaultValue: '09:00', options: digestTimeOptions() }
					}
				]
			},
			{
				// Imperative display() calls this second section 'Data' too;
				// duplicate sibling headings break path-based navigation, so the
				// declarative tree names it for what it holds.
				type: 'group',
				heading: 'Export',
				items: [
					{
						name: 'Export data',
						desc: EXPORT_DESC,
						render: (setting: Setting) => { this.renderExportButton(setting); }
					}
				]
			},
			{
				type: 'group',
				heading: 'Setup',
				items: [
					{
						name: 'Re-run onboarding',
						desc: 'Reset and show the first-time setup wizard again',
						render: (setting: Setting) => { this.renderResetOnboarding(setting); }
					}
				]
			},
			{
				type: 'group',
				heading: 'Feedback & support',
				items: [
					{
						name: 'Send feedback',
						desc: 'Help us improve EMRALD — report bugs, request features, or share your experience',
						render: (setting: Setting) => { this.renderFeedbackButton(setting); }
					},
					{
						name: 'Website',
						desc: 'Learn more about EMRALD and effort management',
						render: (setting: Setting) => { this.renderWebsiteButton(setting); }
					}
				]
			}
		];
	}

	/** 1.13+ refresh hook. Also our chance to pull fresh tier + level data. */
	update(): void {
		super.update();
		void this.refreshTabState();
	}


	// ── Declarative storage hooks ───────────────────────
	// Every `control` binding routes through these. saveSettings() (not bare
	// saveData) so credential re-wiring, folder-sync config, and the sync timer
	// restart keep happening on every declarative control change.

	getControlValue(key: string): unknown {
		if (key === 'digestTime') return this.normalizedDigestTime();
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
		if (key === 'digestDay' || key === 'digestTime') {
			await this.plugin.syncDigestPreferences();
		}
	}

	// ── Shared row renderers (used by BOTH paths) ───────

	private renderApiKeyControl(setting: Setting): void {
		setting.addText(text => {
			text
				.setPlaceholder('Em_...')
				.setValue(this.plugin.settings.apiKey)
				.onChange((value) => {
					this.plugin.settings.apiKey = value;
					void this.plugin.saveSettings();
				});
			text.inputEl.type = 'password';
		});
	}

	private renderConnectionStatus(setting: Setting): void {
		setting.setDesc('Testing...');
		setting.addButton(btn => btn
			.setButtonText('Re-test')
			.onClick(() => { void this.runConnectionTest(setting); }));

		if (this.plugin.settings.apiKey) {
			void this.runConnectionTest(setting);
		} else {
			setting.setDesc('No API key configured');
		}
	}

	private async runConnectionTest(setting: Setting): Promise<void> {
		setting.setDesc('Testing...');
		try {
			const resp = await this.plugin.apiClient.testConnection();
			setting.setDesc(resp.error ? `Error: ${resp.error}` : 'Connected ✓');
		} catch {
			setting.setDesc('Error: could not reach EMRALD');
		}
	}

	private queueStatusDesc(): string {
		const state = this.plugin.offlineQueue.getState();
		const replay = state.lastReplayResult
			? ` • Last replay: ${state.lastReplayResult.success} synced, ${state.lastReplayResult.failed} dropped`
			: '';
		return `${state.pendingCount} pending • ${state.isOnline ? 'Online' : 'Offline'}${replay}`;
	}

	private pendingActionDesc(action: { description: string; retries: number; lastStatus?: number; lastError?: string }): string {
		const status = action.lastStatus !== undefined ? ` • last status: ${action.lastStatus}` : '';
		const error = action.lastError ? ` • ${action.lastError}` : '';
		return `${action.description} • retries: ${action.retries}${status}${error}`;
	}

	private renderQueueStatus(setting: Setting): void {
		setting.setDesc(this.queueStatusDesc());
		setting.addButton(btn => btn
			.setButtonText('Refresh')
			.onClick(() => this.redraw()));
		setting.addButton(btn => btn
			.setDestructive()
			.setButtonText('Clear queue')
			.onClick(() => {
				this.plugin.offlineQueue.clear();
				void this.plugin.saveData(this.plugin.settings);
				new Notice('Offline queue cleared.');
				this.redraw();
			}));
	}

	private renderResearchOptIn(setting: Setting): void {
		setting.addToggle(toggle => toggle
			.setValue(this.plugin.settings.researchOptIn)
			.onChange((value) => {
				this.plugin.settings.researchOptIn = value;
				void this.plugin.saveSettings();
				void this.plugin.apiClient.updatePreferences({ research_opt_in: value }).then(() => {
					new Notice(value ? 'Thank you! Research opt-in saved.' : 'Research opt-in removed.');
				}).catch(() => {
					new Notice('Failed to save preference — try again.');
				});
			}));
	}

	private renderExportButton(setting: Setting): void {
		setting.addButton(btn => {
			btn.setButtonText('Export').onClick(async () => {
				btn.setDisabled(true);
				btn.setButtonText('Exporting...');
				try {
					const resp = await this.plugin.apiClient.exportData();
					if (resp.error) {
						new Notice(`Export failed: ${resp.error}`);
						return;
					}
					const dateStr = new Date().toISOString().split('T')[0];
					const filename = `emrald-export-${dateStr}.json`;
					const content = JSON.stringify(resp.data, null, 2);
					await this.plugin.app.vault.create(filename, content);
					new Notice(`Exported to ${filename}`);
				} catch (e) {
					const msg = e instanceof Error ? e.message : 'Unknown error';
					new Notice(`Export failed: ${msg}`);
				} finally {
					btn.setDisabled(false);
					btn.setButtonText('Export');
				}
			});
		});
	}

	private renderResetOnboarding(setting: Setting): void {
		setting.addButton(btn => btn
			.setButtonText('Reset onboarding')
			.onClick(() => {
				this.plugin.settings.onboardingComplete = false;
				this.plugin.settings.tourDismissed = false;
				this.plugin.settings.advancedProfileCompleted = false;
				void this.plugin.saveSettings().then(async () => {
					const { OnboardingModal } = await import('./onboarding/onboarding');
					const modal = new OnboardingModal(this.plugin.app, this.plugin, () => {
						void this.plugin.activateView();
					});
					modal.open();
				});
			}));
	}

	private renderFeedbackButton(setting: Setting): void {
		setting.addButton(btn => btn
			.setButtonText('Send email')
			.onClick(() => {
				window.open('mailto:feedback@effortmastery.com?subject=EMRALD%20Feedback', '_blank');
			}));
	}

	private renderWebsiteButton(setting: Setting): void {
		setting.addButton(btn => btn
			.setButtonText('Open website')
			.onClick(() => {
				window.open('https://getEMRALD.com', '_blank');
			}));
	}

	// ── Custom effort levels ────────────────────────────

	/** Declarative twin of renderELevelSection(). */
	private eLevelDefinitions(): SettingDefinitionItem[] {
		if (!tierState.isPro()) {
			return [{
				type: 'group',
				heading: 'Custom effort levels',
				cls: ELEVEL_ANCHOR_CLASS,
				items: [{
					name: 'Custom effort levels (PRO)',
					desc: ELEVEL_PRO_PITCH,
					render: (setting: Setting) => { this.renderProLock(setting); }
				}]
			}];
		}

		const definitions: SettingDefinitionItem[] = [{
			type: 'list',
			heading: ELEVEL_MANAGE_HEADING,
			cls: ELEVEL_ANCHOR_CLASS,
			emptyState: ELEVEL_EMPTY_STATE,
			addItem: {
				name: 'New effort level',
				action: () => { this.openELevelEditor('create', null); }
			},
			items: eLevelStore.active().map(level => ({
				name: level.name,
				aliases: [CUSTOM_BADGE, `${level.percent}%`],
				searchable: false,
				render: (setting: Setting) => { this.renderELevelRow(setting, level); }
			}))
		}];

		const archived = eLevelStore.archived();
		if (archived.length > 0) {
			definitions.push({
				type: 'group',
				heading: 'Archived levels',
				items: archived.map(level => ({
					name: level.name,
					searchable: false,
					render: (setting: Setting) => { this.renderELevelRow(setting, level, true); }
				}))
			});
		}

		return definitions;
	}

	/** Imperative twin of eLevelDefinitions(). */
	private renderELevelSection(containerEl: HTMLElement): void {
		if (!tierState.isPro()) {
			const heading = new Setting(containerEl).setName('Custom effort levels').setHeading();
			heading.settingEl.addClass(ELEVEL_ANCHOR_CLASS);
			this.renderProLock(
				new Setting(containerEl)
					.setName('Custom effort levels (PRO)')
					.setDesc(ELEVEL_PRO_PITCH)
			);
			return;
		}

		const heading = new Setting(containerEl).setName(ELEVEL_MANAGE_HEADING).setHeading();
		heading.settingEl.addClass(ELEVEL_ANCHOR_CLASS);

		const active = eLevelStore.active();
		if (active.length === 0) {
			containerEl.createDiv({ cls: 'setting-item-description', text: ELEVEL_EMPTY_STATE });
		}
		for (const level of active) {
			this.renderELevelRow(new Setting(containerEl), level);
		}

		new Setting(containerEl)
			.setName('New effort level')
			.setDesc('Name a level and set its share of your daily work time.')
			.addButton(btn => btn
				.setCta()
				.setButtonText('Create')
				.onClick(() => { this.openELevelEditor('create', null); }));

		const archived = eLevelStore.archived();
		if (archived.length > 0) {
			new Setting(containerEl).setName('Archived levels').setHeading();
			for (const level of archived) {
				this.renderELevelRow(new Setting(containerEl), level, true);
			}
		}
	}

	/**
	 * One custom-level row. Badge is the uniform "EC" tinted by the derived
	 * colour; the full name is the row name and the tooltip. The raw
	 * 'EC:<uuid>' ref is never written into the DOM as text.
	 */
	private renderELevelRow(setting: Setting, level: CustomELevel, archived = false): void {
		const tooltip = levelTooltip(level.ref, [level]);

		setting.nameEl.empty();
		const badge = setting.nameEl.createSpan({
			cls: 'emerald-elevel-badge emerald-elevel-row-badge',
			text: CUSTOM_BADGE
		});
		badge.style.color = colorForPercent(level.percent);
		setTooltip(badge, tooltip);
		setting.nameEl.createSpan({ cls: 'emerald-elevel-row-name', text: level.name });
		if (archived) {
			setting.nameEl.createSpan({ cls: 'emerald-elevel-row-archived', text: 'Archived' });
		}

		setting.setDesc(`${level.percent}% of your daily work time • ${refCountLabel(level.ref_count)}`);
		setting.settingEl.addClass('emerald-elevel-row');

		if (archived) {
			// History only — archived levels can't be edited or re-assigned.
			return;
		}

		setting.addExtraButton(btn => btn
			.setIcon('pencil')
			.setTooltip('Rename')
			.onClick(() => { this.openELevelEditor('rename', level); }));

		// Percent is locked once anything references the level. ref_count null
		// means "unknown", which we treat as referenced. The server enforces it
		// (409 PERCENT_LOCKED); this just avoids a pointless round trip.
		const locked = assumeReferenced(level.ref_count);
		setting.addExtraButton(btn => {
			btn.setIcon('percent')
				.setTooltip(locked
					? `Percent is locked — ${refCountLabel(level.ref_count)}`
					: 'Change percent')
				.onClick(() => {
					if (locked) {
						new Notice(`Percent is locked while this level is ${refCountLabel(level.ref_count)}. Archive it and create a new one to change the percent.`);
						return;
					}
					this.openELevelEditor('percent', level);
				});
			// NOT setDisabled(locked): a disabled button swallows the click, so the
			// explanatory Notice above never fires and the button feels dead
			// (Devon smoke test 2026-08-24). Locked state is conveyed by tooltip,
			// notice, and the muted styling below instead.
			if (locked) btn.extraSettingsEl.addClass('emerald-elevel-percent-locked');
		});

		setting.addExtraButton(btn => btn
			.setIcon('trash-2')
			.setTooltip('Remove')
			.onClick(() => { void this.confirmRemoveLevel(level); }));
	}

	private renderProLock(setting: Setting): void {
		setting.settingEl.addClass('emerald-elevel-locked');
		setting.nameEl.empty();
		setting.nameEl.createSpan({ text: 'Custom effort levels' });
		setting.nameEl.createSpan({ cls: 'emerald-pro-badge', text: 'PRO' });
		setting.addButton(btn => btn
			.setButtonText('Upgrade')
			.onClick(() => {
				window.open(PRO_UPGRADE_URL, '_blank');
			}));
	}

	private openELevelEditor(mode: 'create' | 'rename' | 'percent', level: CustomELevel | null): void {
		void (async () => {
			const { CustomELevelEditorModal } = await import('./modals/custom-elevel-editor');
			const modal = new CustomELevelEditorModal(
				this.plugin.app,
				this.plugin,
				mode,
				level,
				() => this.redraw()
			);
			modal.open();
		})();
	}

	private async confirmRemoveLevel(level: CustomELevel): Promise<void> {
		const { ConfirmRemoveELevelModal } = await import('./modals/custom-elevel-editor');
		const modal = new ConfirmRemoveELevelModal(this.plugin.app, level, () => {
			void this.removeLevel(level);
		});
		modal.open();
	}

	private async removeLevel(level: CustomELevel): Promise<void> {
		const resp = await this.plugin.apiClient.deleteELevel(level.id);

		if (resp.queued) {
			new Notice('You\'re offline — the removal will sync when you reconnect.');
			return;
		}
		if (resp.error || !resp.data) {
			if (resp.errorCode === 'REF_COUNT_UNAVAILABLE') {
				new Notice(`${resp.error ?? 'Could not check how many projects use this level.'} Try again in a moment.`);
			} else if (resp.errorCode === 'PRO_REQUIRED' || resp.status === 403) {
				new Notice(PRO_REQUIRED_NOTICE);
			} else {
				new Notice(resp.error ?? 'Could not remove that level.');
			}
			return;
		}

		// One client intent, two server outcomes — say which one happened.
		if (resp.data.archived) {
			new Notice(`Archived ${level.name} — projects already using it keep their label.`);
		} else {
			new Notice(`Deleted ${level.name}.`);
			eLevelStore.remove(level.id);
		}

		eLevelStore.invalidate();
		await eLevelStore.refresh(this.plugin);
		this.redraw();
	}

	// ── Plumbing ────────────────────────────────────────

	/**
	 * Re-render the declarative tab. minAppVersion is 1.13.0, so update() is
	 * always available — the legacy display() fallback was removed with it.
	 */
	private redraw(): void {
		this.update();
	}

	/**
	 * Pull fresh tier + custom-level state, then redraw only if something
	 * changed. Stale-gated and re-entrancy guarded so redraw() → update() →
	 * refreshTabState() cannot loop.
	 */
	private async refreshTabState(): Promise<void> {
		if (this.refreshingTabState) return;
		if (!this.plugin.settings.apiKey) return;

		this.refreshingTabState = true;
		try {
			const tierBefore = tierState.tier;
			await tierState.refresh(this.plugin.apiClient);
			let changed = tierState.tier !== tierBefore;

			if (eLevelStore.isStale()) {
				const levelsChanged = await eLevelStore.refresh(this.plugin);
				changed = changed || levelsChanged;
			}

			if (changed) this.redraw();
		} finally {
			this.refreshingTabState = false;
		}
	}

	private normalizedDigestTime(): string {
		const stored = this.plugin.settings.digestTime || '09:00';
		const hourPart = (stored.split(':')[0] || '09').padStart(2, '0');
		return `${hourPart}:00`;
	}

	private pendingQueueDefinitions(): SettingDefinitionItem[] {
		const pending = this.plugin.offlineQueue.getPendingActions();
		if (pending.length === 0) return [];
		return [{
			type: 'list',
			heading: 'Pending queued actions',
			items: pending.map(action => ({
				name: action.path,
				desc: this.pendingActionDesc(action),
				searchable: false
			})),
			// Read the live list at click time — a captured index goes stale
			// once the replay loop drains an entry.
			onDelete: (index: number) => {
				const target = this.plugin.offlineQueue.getPendingActions()[index];
				if (!target) return;
				this.plugin.offlineQueue.remove(target.id);
				void this.plugin.saveData(this.plugin.settings);
				this.update();
			}
		}];
	}
}
