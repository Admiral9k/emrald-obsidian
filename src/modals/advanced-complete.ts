// EMRALD Advanced Profile Completion Modal
// Shown after the user answers ALL remaining advanced calibration questions at once.
// Celebrates full profile completion and sets expectations for re-calibration.

import { App, Modal, setIcon } from 'obsidian';

export class AdvancedCompleteModal extends Modal {
	private onDismiss: () => void;

	constructor(app: App, onDismiss: () => void) {
		super(app);
		this.onDismiss = onDismiss;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');

		const iconEl = contentEl.createDiv({ cls: 'emerald-onboard-icon' });
		setIcon(iconEl, 'sparkles');

		contentEl.createEl('h2', { cls: 'emerald-onboard-title', text: 'Profile complete!' });

		contentEl.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'EMRALD now has the fullest picture of how you work. Your effort forecasts, burnout detection, and insights will draw on all of your answers.'
		});

		contentEl.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'You can revisit and update your answers anytime in the effort profile workspace view. If your habits shift, retake the questions to keep your profile current.'
		});

		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		const goBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary emerald-btn-lg',
			text: "Let's go"
		});
		goBtn.addEventListener('click', () => {
			this.close();
			this.onDismiss();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
