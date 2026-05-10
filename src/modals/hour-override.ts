// EMRALD Hour Override Modal
// Adjust today's available hours. Resets at midnight.
// Shows base schedule (day of week), half-hour steps, 0-12h range.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class HourOverrideModal extends Modal {
	private plugin: EmraldPlugin;
	private currentHours: number;
	private baseScheduleHours: number | null;
	private onSubmit: (hours: number) => void;
	private selectedHours: number;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		currentHours: number,
		baseScheduleHours: number | null,
		onSubmit: (hours: number) => void
	) {
		super(app);
		this.plugin = plugin;
		this.currentHours = currentHours;
		this.baseScheduleHours = baseScheduleHours;
		// Default to base schedule if current is 0 (likely unset)
		this.selectedHours = currentHours > 0 ? currentHours : (baseScheduleHours ?? 4);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-houroverride-modal');

		contentEl.createEl('h2', { text: 'Adjust Today\'s Hours' });

		const form = contentEl.createEl('div', { cls: 'emerald-form' });

		// Base schedule display
		const dayName = DAY_NAMES[new Date().getDay()];
		if (this.baseScheduleHours !== null) {
			const baseEl = form.createEl('div', { cls: 'emerald-houroverride-base' });
			baseEl.createEl('span', { text: `Base schedule (${dayName}): ${this.baseScheduleHours}h` });
		}

		// Slider
		const group = form.createEl('div', { cls: 'emerald-form-group' });
		const labelRow = group.createEl('div', { cls: 'emerald-form-label-row' });
		labelRow.createEl('label', { text: 'Today\'s hours' });
		const valueEl = labelRow.createEl('span', {
			cls: 'emerald-slider-value emerald-houroverride-value',
			text: `${this.selectedHours}h`
		});

		// Range: 0-12h in half-hour steps
		const slider = group.createEl('input', { cls: 'emerald-slider' });
		slider.type = 'range';
		slider.min = '0';
		slider.max = '24'; // 24 half-hour steps = 12h
		slider.value = String(this.selectedHours * 2);
		slider.step = '1';
		slider.setAttribute('aria-label', "Today's available hours");
		slider.setAttribute('aria-valuemin', '0');
		slider.setAttribute('aria-valuemax', '12');
		slider.setAttribute('aria-valuenow', String(this.selectedHours));
		slider.setAttribute('aria-valuetext', `${this.selectedHours} hours`);

		// Range labels
		const rangeLabels = group.createEl('div', { cls: 'emerald-houroverride-range' });
		rangeLabels.createEl('span', { text: '0h' });
		rangeLabels.createEl('span', { text: '12h' });

		slider.addEventListener('input', () => {
			this.selectedHours = parseInt(slider.value) / 2;
			valueEl.textContent = `${this.selectedHours}h`;
			slider.setAttribute('aria-valuenow', String(this.selectedHours));
			slider.setAttribute('aria-valuetext', `${this.selectedHours} hours`);
		});

		// Reset note
		form.createEl('div', { cls: 'emerald-form-desc emerald-houroverride-note', text: 'This override resets at midnight.' });

		// Actions
		const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions' });

		const saveBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Save'
		});
		saveBtn.addEventListener('click', () => {
			this.onSubmit(this.selectedHours);
			this.close();
		});

		const cancelBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Cancel'
		});
		cancelBtn.addEventListener('click', () => this.close());

		// Quick reset to base schedule
		if (this.baseScheduleHours !== null && this.selectedHours !== this.baseScheduleHours) {
			const resetBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-subtle',
				text: 'Reset to schedule'
			});
			resetBtn.addEventListener('click', () => {
				this.selectedHours = this.baseScheduleHours!;
				slider.value = String(this.selectedHours * 2);
				valueEl.textContent = `${this.selectedHours}h`;
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
