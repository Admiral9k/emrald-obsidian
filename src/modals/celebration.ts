// EMRALD Celebration Modal
// One-time congratulatory modal after first E-receipt submission.
// Contextualizes the receipt against the user's E-level budget.
// Gated by settings.celebrationShown — fires once, then never again.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';
import { levelDisplayName, prescribedMinutes } from '../e-levels';

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
		contentEl.createEl('h2', { text: 'First receipt filed.' });

		// Body — contextualizes against E-level budget
		const body = contentEl.createDiv({ cls: 'emerald-celebration-body' });

		body.createEl('p', {
			text: "Done! That's your first effort receipt filed. Check out the other core elements of EMRALD."
		});

		// Budget context
		if (this.effortLevel && this.availableHours > 0) {
			const budgetInfo = this.getBudgetContext();
			body.createEl('p', {
				cls: 'emerald-celebration-context',
				text: budgetInfo
			});
		}

		// What else to look at (Devon's approved text, 11/9)
		const list = body.createEl('ul', { cls: 'emerald-celebration-list' });
		const items: Array<[string, string]> = [
			['Check-in', "Give context to the day's weight to better understand your effort."],
			['Projects', 'Choose what to work on next, and set how much of your day it takes.'],
			['Session timer', 'Start (and stop) your project sessions.'],
			['Data Center and effort profile', 'Built from your numbers and receipts. PRO unlocks the whole catalog.'],
			['Burnout', 'A heads-up, free on every plan.'],
		];
		for (const [label, text] of items) {
			const li = list.createEl('li');
			li.createEl('strong', { text: `${label}: ` });
			li.appendText(text);
		}

		// Closer
		body.createEl('p', {
			cls: 'emerald-celebration-encouragement',
			text: 'Your receipts land in your numbers from here on out. Keep filling them out for a month and the full picture is yours!'
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
		// Percent comes from the resolver so a custom level gets a real budget
		// instead of the 50% fallback. Prose uses the level's name, never the ref.
		const prescribedMin = prescribedMinutes(this.effortLevel, this.availableHours);
		const levelName = levelDisplayName(this.effortLevel) || 'effort';
		const percentUsed = prescribedMin > 0
			? Math.round((this.sessionMinutes / prescribedMin) * 100)
			: 0;

		if (percentUsed >= 100) {
			return `That session covered your full ${levelName} budget for ${this.itemName} today.`;
		} else {
			return `That's ${percentUsed}% of your ${levelName} budget for ${this.itemName}.`;
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
