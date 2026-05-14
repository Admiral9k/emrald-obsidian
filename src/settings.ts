import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import EmraldPlugin from '../main';

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
	celebrationShown: false,
	researchOptIn: false,
	digestDay: 'sunday',
	digestTime: '09:00'
};

export class EmraldSettingTab extends PluginSettingTab {
	plugin: EmraldPlugin;

	constructor(app: App, plugin: EmraldPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		;

		// ── Account ─────────────────────────────────────────

		new Setting(containerEl).setName('Account').setHeading();

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Your EMRALD API key from effortmastery.com')
			.addText(text => text
				.setPlaceholder('Em_...')
				.setValue(this.plugin.settings.apiKey)
				.onChange((value) => {
					this.plugin.settings.apiKey = value;
					void this.plugin.saveSettings();
				})
				.inputEl.type = 'password');

		new Setting(containerEl)
			.setName('API URL')
			.setDesc('EMRALD API endpoint')
			.addText(text => text
				.setValue(this.plugin.settings.apiUrl)
				.onChange((value) => {
					this.plugin.settings.apiUrl = value;
					void this.plugin.saveSettings();
				}));

		// Connection status
		const statusSetting = new Setting(containerEl)
			.setName('Connection status')
			.setDesc('Testing...')
			.addButton(btn => btn
				.setButtonText('Re-test')
				.onClick(() => {
					statusSetting.setDesc('Testing...');
					void this.plugin.apiClient.testConnection().then(resp => {
						statusSetting.setDesc(resp.error ? `Error: ${resp.error}` : 'Connected 2713');
					});
				}));

		if (this.plugin.settings.apiKey) {
			void this.plugin.apiClient.testConnection().then(resp => {
						statusSetting.setDesc(resp.error ? `Error: ${resp.error}` : 'Connected 2713');
			});
		} else {
			statusSetting.setDesc('No API key configured');
		}

		// ── Folders ─────────────────────────────────────────

		new Setting(containerEl).setName('Folders').setHeading();

		new Setting(containerEl)
			.setName('Active projects folder')
			.setDesc('Folder path for active project notes')
			.addText(text => text
				.setPlaceholder('Active')
				.setValue(this.plugin.settings.activeFolderPath)
				.onChange((value) => {
					this.plugin.settings.activeFolderPath = value;
					void this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Inactive projects folder')
			.setDesc('Folder path for inactive/paused project notes')
			.addText(text => text
				.setPlaceholder('Inactive')
				.setValue(this.plugin.settings.inactiveFolderPath)
				.onChange((value) => {
					this.plugin.settings.inactiveFolderPath = value;
					void this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-detect new notes')
			.setDesc('Prompt when new notes appear in active folder')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectNotes)
				.onChange((value) => {
					this.plugin.settings.autoDetectNotes = value;
					void this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-detect folder moves')
			.setDesc('Prompt when notes move between active/inactive')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectMoves)
				.onChange((value) => {
					this.plugin.settings.autoDetectMoves = value;
					void this.plugin.saveSettings();
				}));

		// ── Timeblock ───────────────────────────────────────

		new Setting(containerEl).setName('Timeblock').setHeading();

		new Setting(containerEl)
			.setName('Show overtime indicator')
			.setDesc('Yellow bar + counter when exceeding daily hours')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showOvertime)
				.onChange((value) => {
					this.plugin.settings.showOvertime = value;
					void this.plugin.saveSettings();
				}));

		// ── Notifications ───────────────────────────────────

		new Setting(containerEl).setName('Notifications').setHeading();

		new Setting(containerEl)
			.setName('Burnout warning modals')
			.setDesc('Show burnout warning modals when d8 crosses threshold')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.burnoutModalEnabled)
				.onChange((value) => {
					this.plugin.settings.burnoutModalEnabled = value;
					void this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Insight rotation speed')
			.setDesc('Seconds between rotating bulletin cards (5-60)')
			.addSlider(slider => slider
				.setLimits(5, 60, 5)
				.setValue(this.plugin.settings.insightRotationSeconds)
				.setDynamicTooltip()
				.onChange((value) => {
					this.plugin.settings.insightRotationSeconds = value;
					void this.plugin.saveSettings();
				}));

		// ── Display ─────────────────────────────────────────

		new Setting(containerEl).setName('Display').setHeading();

		new Setting(containerEl)
			.setName('Timer style')
			.setDesc('How the session timer is displayed')
			.addDropdown(drop => drop
				.addOption('digital', 'Digital')
				.addOption('analog', 'Analog (post-mvp)')
				.addOption('timetimer', 'Time timer (post-mvp)')
				.setValue(this.plugin.settings.timerStyle)
				.onChange((value) => {
					this.plugin.settings.timerStyle = value as 'digital' | 'analog' | 'timetimer';
					void this.plugin.saveSettings();
				}));

		// ── Data ────────────────────────────────────────────

		new Setting(containerEl).setName('Data').setHeading();

		new Setting(containerEl)
			.setName('Sync interval')
			.setDesc('Minutes between automatic API syncs (1-30)')
			.addSlider(slider => slider
				.setLimits(1, 30, 1)
				.setValue(this.plugin.settings.syncIntervalMinutes)
				.setDynamicTooltip()
				.onChange((value) => {
					this.plugin.settings.syncIntervalMinutes = value;
					void this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Frontmatter sync')
			.setDesc('Write EMRALD metadata to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.frontmatterEnabled)
				.onChange((value) => {
					this.plugin.settings.frontmatterEnabled = value;
					void this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Log API calls and state changes to console')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugLogging)
				.onChange((value) => {
					this.plugin.settings.debugLogging = value;
					void this.plugin.saveSettings();
				}));

		// Offline queue diagnostics
		const queue = this.plugin.offlineQueue;
		const queueState = queue.getState();
		const pending = queue.getPendingActions();

		new Setting(containerEl)
			.setName('Offline queue status')
			.setDesc(`${queueState.pendingCount} pending • ${queueState.isOnline ? 'Online' : 'Offline'}${queueState.lastReplayResult ? ` • Last replay: ${queueState.lastReplayResult.success} synced, ${queueState.lastReplayResult.failed} dropped` : ''}`)
			.addButton(btn => btn
				.setButtonText('Refresh')
				.onClick(() => this.display()))
			.addButton(btn => btn
				.setWarning()
				.setButtonText('Clear queue')
				.onClick(() => {
					queue.clear();
					void this.plugin.saveData(this.plugin.settings);
					new Notice('Offline queue cleared.');
					this.display();
				}));

		if (pending.length > 0) {
			containerEl.createDiv({ text: 'Pending queued actions:', cls: 'setting-item-description' });
			for (const action of pending) {
				const desc = `${action.description} • retries: ${action.retries}${action.lastStatus !== undefined ? ` • last status: ${action.lastStatus}` : ''}${action.lastError ? ` • ${action.lastError}` : ''}`;
				new Setting(containerEl)
					.setName(action.path)
					.setDesc(desc)
					.addButton(btn => btn
						.setButtonText('Remove')
						.onClick(() => {
							queue.remove(action.id);
							void this.plugin.saveData(this.plugin.settings);
							this.display();
						}));
			}
		}

		// ── Privacy ─────────────────────────────────────────

		new Setting(containerEl).setName('Privacy').setHeading();

		new Setting(containerEl)
			.setName('Help improve EMRALD')
			.setDesc(
				'Effort management is a new field, and every data point helps make it better. ' +
				'Your anonymized usage patterns (never notes, names, or identifiers) help us build smarter ' +
				'features and may be used in published research by Effort Mastery LLC. You can change this anytime.'
			)
			.addToggle(toggle => toggle
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

		// ── Digest ──────────────────────────────────────────

		new Setting(containerEl).setName('Digest').setHeading();

		new Setting(containerEl)
			.setName('Digest delivery day')
			.setDesc('Day of the week your weekly digest is generated')
			.addDropdown(drop => drop
				.addOption('sunday', 'Sunday')
				.addOption('monday', 'Monday')
				.addOption('tuesday', 'Tuesday')
				.addOption('wednesday', 'Wednesday')
				.addOption('thursday', 'Thursday')
				.addOption('friday', 'Friday')
				.addOption('saturday', 'Saturday')
				.setValue(this.plugin.settings.digestDay)
				.onChange((value) => {
					this.plugin.settings.digestDay = value as EmraldSettings['digestDay'];
					void this.plugin.saveSettings();
					void this.plugin.syncDigestPreferences();
				}));

		new Setting(containerEl)
			.setName('Digest delivery time')
			.setDesc('Time of day in UTC (24h format, e.g. 09:00 = 4am est)')
			.addText(text => {
				let debounce: number | null = null;
				text
					.setPlaceholder('09:00')
					.setValue(this.plugin.settings.digestTime)
					.onChange((value) => {
						this.plugin.settings.digestTime = value;
						void this.plugin.saveSettings();
						if (debounce) window.clearTimeout(debounce);
						debounce = window.setTimeout(() => {
							void this.plugin.syncDigestPreferences();
						}, 700);
					});
			});

		// ── Onboarding ──────────────────────────────────────

		new Setting(containerEl).setName('Setup').setHeading();

		new Setting(containerEl)
			.setName('Re-run onboarding')
			.setDesc('Reset and show the first-time setup wizard again')
			.addButton(btn => btn
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

		// ── Feedback & Support ──────────────────────────────

		new Setting(containerEl).setName('Feedback & support').setHeading();

		new Setting(containerEl)
			.setName('Send feedback')
			.setDesc('Help us improve EMRALD — report bugs, request features, or share your experience')
			.addButton(btn => btn
				.setButtonText('Send email')
				.onClick(() => {
					window.open('mailto:feedback@effortmastery.com?subject=EMRALD%20Feedback', '_blank');
				}));

		new Setting(containerEl)
			.setName('Website')
			.setDesc('Learn more about EMRALD and effort management')
			.addButton(btn => btn
				.setButtonText('Open website')
				.onClick(() => {
					window.open('https://getEMRALD.com', '_blank');
				}));
	}
}
