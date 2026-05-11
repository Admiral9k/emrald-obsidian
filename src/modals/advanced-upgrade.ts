// EMRALD Advanced Mode Upgrade Modal
// One-time prompt after onboarding, offering to enable Advanced calibration.
// If accepted, sets profile_mode to 'advanced' and shows gradual questions at session start.

import { App, Modal, Notice, setIcon } from 'obsidian';
import EmraldPlugin from '../../main';

export class AdvancedUpgradeModal extends Modal {
	private plugin: EmraldPlugin;
	private onAccept: () => void;
	private onDecline: () => void;

	constructor(app: App, plugin: EmraldPlugin, onAccept: () => void, onDecline: () => void) {
		super(app);
		this.plugin = plugin;
		this.onAccept = onAccept;
		this.onDecline = onDecline;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');

		const iconEl = contentEl.createDiv({ cls: 'emerald-onboard-icon' });
		setIcon(iconEl, 'sparkles');

		contentEl.createEl('h2', { text: 'Go advanced?' });

		contentEl.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: "You've completed your basic effort profile — EMRALD is already working for you."
		});

		contentEl.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: "Advanced mode unlocks 30 additional calibration questions that help EMRALD understand your work style at a deeper level. They're presented gradually — just 3-4 questions before each session, over about 8 sessions."
		});

		const benefits = contentEl.createDiv({ cls: 'emerald-onboard-features' });
		const items = [
			{ icon: 'target', text: 'More accurate effort predictions' },
			{ icon: 'brain', text: 'Deeper personality-aware insights' },
			{ icon: 'flame', text: 'Earlier burnout pattern detection' },
			{ icon: 'trending-up', text: 'Better calibration drift tracking (D19)' }
		];

		for (const item of items) {
			const row = benefits.createDiv({ cls: 'emerald-onboard-feature' });
			const iconSpan = row.createSpan({ cls: 'emerald-onboard-feature-icon' });
			setIcon(iconSpan, item.icon);
			row.createSpan({ text: item.text });
		}

		contentEl.createEl('p', {
			cls: 'emerald-onboard-desc emerald-text-muted',
			text: 'You can always switch back to simple mode in settings.'
		});

		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		const acceptBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary emerald-btn-lg',
			text: 'Enable advanced mode'
		});
		acceptBtn.addEventListener('click', () => { void (async () => {
			try {
				// Update profile mode to advanced
				try {
					await this.plugin.apiClient.updateProfile({ question_mode: 'advanced' });
					new Notice("Advanced mode enabled! You'll see calibration questions before your next session.");
				} catch { /* non-fatal */
					new Notice('Advanced mode enabled locally — will sync on next session.');
				}
				this.close();

				// Offer to start answering now
				const { AdvancedCalibrationModal, getAdvancedQuestionCount } = await import('./advanced-calibration');
				const total = getAdvancedQuestionCount();
				const startNowModal = new AdvancedCalibrationModal(
					this.app,
					this.plugin,
					[],        // no answered keys yet
					total,     // all remaining
					() => {
						// Done answering first batch
						this.onAccept();
					},
					() => {
						// Skipped — that's fine, they'll see more at session start
						this.onAccept();
					}
				);
				startNowModal.open();
			} catch { /* non-fatal */ }
		})(); });

		const declineBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: 'Maybe later — keep simple mode'
		});
		declineBtn.addEventListener('click', () => {
			this.close();
			this.onDecline();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
