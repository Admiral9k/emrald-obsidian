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

		containerEl.createEl('h2', { text: 'EMRALD Settings' });

		// ── Account ─────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Account' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your EMRALD API key from effortmastery.com')
			.addText(text => text
				.setPlaceholder('em_...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				})
				.inputEl.type = 'password');

		new Setting(containerEl)
			.setName('API URL')
			.setDesc('EMRALD API endpoint')
			.addText(text => text
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiUrl = value;
					await this.plugin.saveSettings();
				}));

		// Connection status
		const statusSetting = new Setting(containerEl)
			.setName('Connection Status')
			.setDesc('Testing...')
			.addButton(btn => btn
				.setButtonText('Re-test')
				.onClick(async () => {
					statusSetting.setDesc('Testing...');
					const resp = await this.plugin.apiClient.testConnection();
					statusSetting.setDesc(resp.error ? `Error: ${resp.error}` : 'Connected ✓');
				}));

		if (this.plugin.settings.apiKey) {
			this.plugin.apiClient.testConnection().then(resp => {
				statusSetting.setDesc(resp.error ? `Error: ${resp.error}` : 'Connected ✓');
			});
		} else {
			statusSetting.setDesc('No API key configured');
		}

		// ── Folders ─────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Folders' });

		new Setting(containerEl)
			.setName('Active Projects Folder')
			.setDesc('Folder path for active project notes')
			.addText(text => text
				.setPlaceholder('Active')
				.setValue(this.plugin.settings.activeFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.activeFolderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Inactive Projects Folder')
			.setDesc('Folder path for inactive/paused project notes')
			.addText(text => text
				.setPlaceholder('Inactive')
				.setValue(this.plugin.settings.inactiveFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.inactiveFolderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-detect new notes')
			.setDesc('Prompt when new notes appear in Active folder')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectNotes)
				.onChange(async (value) => {
					this.plugin.settings.autoDetectNotes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-detect folder moves')
			.setDesc('Prompt when notes move between Active/Inactive')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectMoves)
				.onChange(async (value) => {
					this.plugin.settings.autoDetectMoves = value;
					await this.plugin.saveSettings();
				}));

		// ── Timeblock ───────────────────────────────────────

		containerEl.createEl('h3', { text: 'Timeblock' });

		new Setting(containerEl)
			.setName('Show overtime indicator')
			.setDesc('Yellow bar + counter when exceeding daily hours')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showOvertime)
				.onChange(async (value) => {
					this.plugin.settings.showOvertime = value;
					await this.plugin.saveSettings();
				}));

		// ── Notifications ───────────────────────────────────

		containerEl.createEl('h3', { text: 'Notifications' });

		new Setting(containerEl)
			.setName('Burnout warning modals')
			.setDesc('Show burnout warning modals when D8 crosses threshold')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.burnoutModalEnabled)
				.onChange(async (value) => {
					this.plugin.settings.burnoutModalEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Insight rotation speed')
			.setDesc('Seconds between rotating bulletin cards (5-60)')
			.addSlider(slider => slider
				.setLimits(5, 60, 5)
				.setValue(this.plugin.settings.insightRotationSeconds)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.insightRotationSeconds = value;
					await this.plugin.saveSettings();
				}));

		// ── Display ─────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Display' });

		new Setting(containerEl)
			.setName('Timer style')
			.setDesc('How the session timer is displayed')
			.addDropdown(drop => drop
				.addOption('digital', 'Digital')
				.addOption('analog', 'Analog (post-MVP)')
				.addOption('timetimer', 'Time Timer (post-MVP)')
				.setValue(this.plugin.settings.timerStyle)
				.onChange(async (value) => {
					this.plugin.settings.timerStyle = value as 'digital' | 'analog' | 'timetimer';
					await this.plugin.saveSettings();
				}));

		// ── Data ────────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Data' });

		new Setting(containerEl)
			.setName('Sync interval')
			.setDesc('Minutes between automatic API syncs (1-30)')
			.addSlider(slider => slider
				.setLimits(1, 30, 1)
				.setValue(this.plugin.settings.syncIntervalMinutes)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.syncIntervalMinutes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Frontmatter sync')
			.setDesc('Write EMRALD metadata to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.frontmatterEnabled)
				.onChange(async (value) => {
					this.plugin.settings.frontmatterEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Log API calls and state changes to console')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugLogging)
				.onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
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
				.setButtonText('Clear Queue')
				.onClick(async () => {
					queue.clear();
					await this.plugin.saveData(this.plugin.settings);
					new Notice('Offline queue cleared.');
					this.display();
				}));

		if (pending.length > 0) {
			containerEl.createEl('div', { text: 'Pending queued actions:', cls: 'setting-item-description' });
			for (const action of pending) {
				const desc = `${action.description} • retries: ${action.retries}${action.lastStatus !== undefined ? ` • last status: ${action.lastStatus}` : ''}${action.lastError ? ` • ${action.lastError}` : ''}`;
				new Setting(containerEl)
					.setName(action.path)
					.setDesc(desc)
					.addButton(btn => btn
						.setButtonText('Remove')
						.onClick(async () => {
							queue.remove(action.id);
							await this.plugin.saveData(this.plugin.settings);
							this.display();
						}));
			}
		}

		// ── Privacy ─────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Privacy' });

		new Setting(containerEl)
			.setName('Help improve EMRALD')
			.setDesc(
				'Effort management is a new field, and every data point helps make it better. ' +
				'Your anonymized usage patterns (never notes, names, or identifiers) help us build smarter ' +
				'features and may be used in published research by Effort Mastery LLC. You can change this anytime.'
			)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.researchOptIn)
				.onChange(async (value) => {
					this.plugin.settings.researchOptIn = value;
					await this.plugin.saveSettings();
					try {
						await this.plugin.apiClient.updatePreferences({ research_opt_in: value });
						new Notice(value ? 'Thank you! Research opt-in saved.' : 'Research opt-in removed.');
					} catch {
						new Notice('Failed to save preference — try again.');
					}
				}));

		// ── Digest ──────────────────────────────────────────

		containerEl.createEl('h3', { text: 'Digest' });

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
				.onChange(async (value) => {
					this.plugin.settings.digestDay = value as EmraldSettings['digestDay'];
					await this.plugin.saveSettings();
					await this.plugin.syncDigestPreferences();
				}));

		new Setting(containerEl)
			.setName('Digest delivery time')
			.setDesc('Time of day in UTC (24h format, e.g. 09:00 = 4am EST)')
			.addText(text => {
				let debounce: ReturnType<typeof setTimeout> | null = null;
				text
					.setPlaceholder('09:00')
					.setValue(this.plugin.settings.digestTime)
					.onChange(async (value) => {
						this.plugin.settings.digestTime = value;
						await this.plugin.saveSettings();
						if (debounce) clearTimeout(debounce);
						debounce = setTimeout(() => {
							this.plugin.syncDigestPreferences();
						}, 700);
					});
			});

		// ── Onboarding ──────────────────────────────────────

		containerEl.createEl('h3', { text: 'Setup' });

		new Setting(containerEl)
			.setName('Re-run onboarding')
			.setDesc('Reset and show the first-time setup wizard again')
			.addButton(btn => btn
				.setButtonText('Reset Onboarding')
				.onClick(async () => {
					this.plugin.settings.onboardingComplete = false;
					this.plugin.settings.tourDismissed = false;
					this.plugin.settings.advancedProfileCompleted = false;
					await this.plugin.saveSettings();
					// Open onboarding
					const { OnboardingModal } = await import('./onboarding/onboarding');
					const modal = new OnboardingModal(this.plugin.app, this.plugin, () => {
						this.plugin.activateView();
					});
					modal.open();
				}));

		// ── Feedback & Support ──────────────────────────────

		containerEl.createEl('h3', { text: 'Feedback & Support' });

		new Setting(containerEl)
			.setName('Send feedback')
			.setDesc('Help us improve EMRALD — report bugs, request features, or share your experience')
			.addButton(btn => btn
				.setButtonText('Send Email')
				.onClick(() => {
					window.open('mailto:feedback@effortmastery.com?subject=EMRALD%20Feedback', '_blank');
				}));

		new Setting(containerEl)
			.setName('Website')
			.setDesc('Learn more about EMRALD and Effort Management')
			.addButton(btn => btn
				.setButtonText('getemrald.com')
				.onClick(() => {
					window.open('https://getemrald.com', '_blank');
				}));
	}
}
