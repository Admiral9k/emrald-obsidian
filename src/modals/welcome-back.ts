// EMRALD Welcome Back Modal
// Shows when user returns after 3+ days of inactivity.
// Warm, encouraging tone. Shows brief summary of where they left off.
// Trigger: sidebar onOpen checks last session date vs today.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';

export class WelcomeBackModal extends Modal {
	private plugin: EmraldPlugin;
	private daysSinceLastSession: number;
	private lastProjectName: string;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		opts: {
			daysSinceLastSession: number;
			lastProjectName?: string;
		}
	) {
		super(app);
		this.plugin = plugin;
		this.daysSinceLastSession = opts.daysSinceLastSession;
		this.lastProjectName = opts.lastProjectName ?? '';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-welcomeback-modal');

		// Welcome icon
		const iconEl = contentEl.createEl('div', { cls: 'emerald-welcomeback-icon' });
		iconEl.textContent = '👋';

		// Title — varies by gap length
		const title = this.daysSinceLastSession >= 7
			? 'Long time no see!'
			: 'Welcome back!';
		contentEl.createEl('h2', { text: title });

		// Body
		const body = contentEl.createEl('div', { cls: 'emerald-welcomeback-body' });

		// Context about the gap
		const gapText = this.daysSinceLastSession === 1
			? 'a day'
			: `${this.daysSinceLastSession} days`;

		body.createEl('p', {
			text: `It's been ${gapText} since your last session. No judgment — life happens.`
		});

		// Where they left off (if we have context)
		if (this.lastProjectName) {
			body.createEl('p', {
				text: `Last time you were working on ${this.lastProjectName}. Pick up where you left off, or start something fresh.`
			});
		}

		// Encouragement — gentle nudge, not guilt
		body.createEl('p', {
			cls: 'emerald-welcomeback-encouragement',
			text: 'Every session — even a short one — gives EMRALD better data to work with. Start small if you need to.'
		});

		// Single dismiss button
		const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions emerald-welcomeback-actions' });
		const btn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Let\'s go'
		});
		btn.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
