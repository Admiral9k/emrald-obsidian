// EMRALD Celebration Modal
// One-time congratulatory modal after first E-receipt submission.
// Contextualizes the receipt against the user's E-level budget.
// Gated by settings.celebrationShown — fires once, then never again.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';

export class CelebrationModal extends Modal {
	private plugin: EmraldPlugin;
	private itemName: string;
	private effortLevel: string;
	private sessionMinutes: number;
	private availableHours: number;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		opts: {
			itemName: string;
			effortLevel?: string;
			sessionMinutes: number;
			availableHours: number;
		}
	) {
		super(app);
		this.plugin = plugin;
		this.itemName = opts.itemName;
		this.effortLevel = opts.effortLevel ?? '';
		this.sessionMinutes = opts.sessionMinutes;
		this.availableHours = opts.availableHours;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-celebration-modal');

		// Celebration icon
		const iconEl = contentEl.createDiv({ cls: 'emerald-celebration-icon' });
		iconEl.textContent = '🎉';

		// Title
		contentEl.createEl('h2', { text: 'Your first effort receipt!' });

		// Body — contextualizes against E-level budget
		const body = contentEl.createDiv({ cls: 'emerald-celebration-body' });

		body.createEl('p', {
			text: `You just logged ${this.formatDuration(this.sessionMinutes)} on ${this.itemName}. That's real data about how you spend your effort.`
		});

		// Budget context
		if (this.effortLevel && this.availableHours > 0) {
			const budgetInfo = this.getBudgetContext();
			body.createEl('p', {
				cls: 'emerald-celebration-context',
				text: budgetInfo
			});
		}

		// Encouragement
		body.createEl('p', {
			cls: 'emerald-celebration-encouragement',
			text: 'Every receipt you submit makes EMRALD smarter about your effort patterns. Keep going — your data tells a story no task list ever could.'
		});

		// Single dismiss button
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions emerald-celebration-actions' });
		const btn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Got it!'
		});
		btn.addEventListener('click', () => this.close());
	}

	private getBudgetContext(): string {
		const eLevelPercent: Record<string, number> = {
			E1: 0.25, E2: 0.50, E3: 0.75, E4: 1.00
		};
		const percent = eLevelPercent[this.effortLevel] ?? 0.5;
		const prescribedMin = this.availableHours * 60 * percent;
		const percentUsed = Math.round((this.sessionMinutes / prescribedMin) * 100);

		if (percentUsed >= 100) {
			return `That session covered your full ${this.effortLevel} budget for ${this.itemName} today. Well spent.`;
		} else {
			return `That's ${percentUsed}% of your ${this.effortLevel} budget for ${this.itemName}. EMRALD tracks this so you don't have to guess.`;
		}
	}

	private formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = Math.round(minutes % 60);
		if (h === 0) return `${m}m`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	onClose() {
		this.contentEl.empty();
	}
}
