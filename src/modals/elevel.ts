// EMRALD E-Level Assignment Modal
// Simple picker for E1-E4 with descriptions.
// Shows current level, available hours context, and prescribed time per level.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';

export class ELevelModal extends Modal {
	private plugin: EmraldPlugin;
	private itemName: string;
	private currentLevel: 'E1' | 'E2' | 'E3' | 'E4';
	private availableHours: number;
	private onSubmit: (level: 'E1' | 'E2' | 'E3' | 'E4') => void;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		itemName: string,
		currentLevel: 'E1' | 'E2' | 'E3' | 'E4',
		availableHours: number,
		onSubmit: (level: 'E1' | 'E2' | 'E3' | 'E4') => void
	) {
		super(app);
		this.plugin = plugin;
		this.itemName = itemName;
		this.currentLevel = currentLevel;
		this.availableHours = availableHours;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-elevel-modal');

		contentEl.createEl('h2', { text: 'Set E-level' });
		contentEl.createEl('p', { cls: 'emerald-modal-subtitle', text: this.itemName });

		// Current level indicator
		const currentEl = contentEl.createEl('div', { cls: 'emerald-elevel-current' });
		currentEl.createEl('span', { text: `Current: ${this.currentLevel}` });

		// Available hours context
		const contextEl = contentEl.createEl('div', { cls: 'emerald-elevel-context' });
		contextEl.createEl('span', { text: `Today you have: ${this.availableHours}h available` });

		// E-level options
		const form = contentEl.createEl('div', { cls: 'emerald-form emerald-elevel-options' });

		const levels: Array<{ level: 'E1' | 'E2' | 'E3' | 'E4'; desc: string; pct: number }> = [
			{ level: 'E1', desc: 'Light — 25% of your daily work time', pct: 25 },
			{ level: 'E2', desc: 'Moderate — 50% of your daily work time', pct: 50 },
			{ level: 'E3', desc: 'Demanding — 75% of your daily work time', pct: 75 },
			{ level: 'E4', desc: 'Maximum — 100% of your daily work time', pct: 100 }
		];

		for (const { level, desc, pct } of levels) {
			const prescribedHours = (this.availableHours * pct / 100).toFixed(1);
			const btn = form.createEl('button', {
				cls: `emerald-elevel-option ${level === this.currentLevel ? 'is-active' : ''}`,
			});

			const labelRow = btn.createEl('div', { cls: 'emerald-elevel-option-label' });
			labelRow.createEl('span', { cls: 'emerald-elevel-option-level', text: level });
			labelRow.createEl('span', { cls: 'emerald-elevel-option-desc', text: `${desc} (${pct}%)` });

			btn.createEl('div', { cls: 'emerald-elevel-option-time', text: `~${prescribedHours}h on a ${this.availableHours}h day` });

			btn.addEventListener('click', () => {
				this.onSubmit(level);
				this.close();
			});
		}

		// Actions
		const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions' });

		const cancelBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Cancel'
		});
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
