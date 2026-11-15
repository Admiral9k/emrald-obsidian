// EMRALD Celebration Modal
// One-time modal after the first effort receipt. Copy: src/onboarding/copy.ts (deck keys cel.*).
// Gated by the account's receipt total (sidebar.ts): fires only when the receipt just filed is the account's first.
// The "N% of today's work hours" line is cut from this first modal on purpose (deck: cel.context, later).

import { App, Modal } from 'obsidian';
import { COPY } from '../onboarding/copy';

export class CelebrationModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-celebration-modal');

		const iconEl = contentEl.createDiv({ cls: 'emerald-celebration-icon' });
		iconEl.textContent = '\u{1F389}';

		contentEl.createEl('h2', { text: COPY['cel.title'] });

		const body = contentEl.createDiv({ cls: 'emerald-celebration-body' });
		body.createEl('p', { text: COPY['cel.win'] });

		const list = body.createEl('ul', { cls: 'emerald-celebration-list' });
		for (const key of ['cel.numbers', 'cel.checkin', 'cel.burnout']) {
			list.createEl('li', { text: COPY[key] });
		}

		body.createEl('p', { cls: 'emerald-celebration-encouragement', text: COPY['cel.closer'] });

		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions emerald-celebration-actions' });
		const btn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: COPY['cel.cta'] });
		btn.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
