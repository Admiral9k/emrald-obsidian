// New Project Modal
// Adapted from ELevelModal — editable name field + E-level picker.
// Clicking an E-level row creates the project immediately.

import { App, Modal, Notice } from 'obsidian';
import EmraldPlugin from '../../main';

export class NewProjectModal extends Modal {
	private plugin: EmraldPlugin;
	private availableHours: number;
	private onSubmit: (name: string, level: 'E1' | 'E2' | 'E3' | 'E4') => void;
	private nameInput: HTMLInputElement | null = null;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		onSubmit: (name: string, level: 'E1' | 'E2' | 'E3' | 'E4') => void,
		availableHours = 4
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
		this.availableHours = availableHours;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-elevel-modal');

		contentEl.createEl('h2', { text: 'Create new project' });

		// Editable project name — same green-bordered input as ELevelModal's subtitle area
		this.nameInput = contentEl.createEl('input', {
			cls: 'emerald-modal-name-input',
			placeholder: 'Project name'
		}) as HTMLInputElement;
		this.nameInput.focus();

		// Available hours context (same as ELevelModal)
		const contextEl = contentEl.createEl('div', { cls: 'emerald-elevel-context' });
		contextEl.createEl('span', { text: `Today you have: ${this.availableHours}h available` });

		// E-level options — clicking one submits immediately (same UX as ELevelModal)
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
				cls: 'emerald-elevel-option'
			});

			const labelRow = btn.createEl('div', { cls: 'emerald-elevel-option-label' });
			labelRow.createEl('span', { cls: 'emerald-elevel-option-level', text: level });
			labelRow.createEl('span', { cls: 'emerald-elevel-option-desc', text: `${desc} (${pct}%)` });
			btn.createEl('div', { cls: 'emerald-elevel-option-time', text: `~${prescribedHours}h on a ${this.availableHours}h day` });

			btn.addEventListener('click', () => {
				const name = this.nameInput?.value.trim() ?? '';
				if (!name) {
					new Notice('Project name is required');
					this.nameInput?.focus();
					return;
				}
				this.onSubmit(name, level);
				this.close();
			});
		}

		// Cancel only — confirming happens by clicking an E-level row
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
