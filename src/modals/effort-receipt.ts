// EMRALD Effort Receipt Modal
// Post-session reflection: captures perceived effort, hedonic valence, flow,
// demand-investment balance, effort source, and optional notes.
// ~20 seconds to complete. Fast, tactile, not a chore.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';
import { CreateReceiptPayload } from '../api/client';

export class EffortReceiptModal extends Modal {
	private plugin: EmraldPlugin;
	private sessionId: string;
	private itemName: string;
	private effortLevel: string;
	private sessionMinutes: number;
	private metPrescribedEffort: boolean;
	private onSubmit: (receipt: CreateReceiptPayload, markComplete: boolean) => void;

	// Form state
	private perceivedEffort: number = 5;
	private hedonicValence: number = 5;
	private flowOccurred: number = 0;
	private demandInvestmentBalance: number = 5;
	private effortSource: string[] = [];
	private notes: string = '';

	constructor(
		app: App,
		plugin: EmraldPlugin,
		opts: {
			sessionId: string;
			itemName: string;
			effortLevel?: string;
			sessionMinutes: number;
			metPrescribedEffort: boolean;
		},
		onSubmit: (receipt: CreateReceiptPayload, markComplete: boolean) => void
	) {
		super(app);
		this.plugin = plugin;
		this.sessionId = opts.sessionId;
		this.itemName = opts.itemName;
		this.effortLevel = opts.effortLevel ?? '';
		this.sessionMinutes = opts.sessionMinutes;
		this.metPrescribedEffort = opts.metPrescribedEffort;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-receipt-modal');

		// Title with E-level and duration
		contentEl.createEl('h2', { text: 'Effort receipt' });
		const subtitle = this.effortLevel
			? `${this.itemName} (${this.effortLevel})  •  ${this.formatDuration(this.sessionMinutes)}`
			: `${this.itemName}  •  ${this.formatDuration(this.sessionMinutes)}`;
		contentEl.createEl('p', { cls: 'emerald-modal-subtitle', text: subtitle });

		// Form
		const form = contentEl.createDiv({ cls: 'emerald-form' });

		// Perceived Effort (1-10 slider)
		this.renderSlider(form, 'How hard was that?', null, 1, 10, 5, (val) => {
			this.perceivedEffort = val;
		}, 'Easy', 'Exhausting');

		// Effort Source (multi-select — large tap targets per spec)
		this.renderEffortSource(form);

		// Demand-Investment Balance (1-10 slider)
		this.renderSlider(form, 'Did you give the right amount of effort for what this project needed?', null, 1, 10, 5, (val) => {
			this.demandInvestmentBalance = val;
		}, 'Under', 'Over');

		// Flow (0/1/2 buttons)
		this.renderFlowButtons(form);

		// Hedonic Valence — how pleasant (1-10)
		this.renderSlider(form, 'How pleasant was this work?', null, 1, 10, 5, (val) => {
			this.hedonicValence = val;
		}, 'Unpleasant', 'Enjoyable');

		// Notes (textarea)
		const notesGroup = form.createDiv({ cls: 'emerald-form-group' });
		notesGroup.createEl('label', { text: 'Notes (optional)' });
		const textarea = notesGroup.createEl('textarea', { cls: 'emerald-textarea' });
		textarea.placeholder = 'Any observations?';
		textarea.addEventListener('input', () => {
			this.notes = textarea.value;
		});

		// Completion prompt (if met prescribed effort)
		if (this.metPrescribedEffort) {
			const completionGroup = form.createDiv({ cls: 'emerald-completion-prompt' });
			completionGroup.createEl('p', {
				text: `You've met the ${this.effortLevel || 'prescribed'} target for ${this.itemName}. Mark complete for today?`
			});
		}

		// Actions
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		if (this.metPrescribedEffort) {
			const completeBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Submit & complete'
			});
			completeBtn.addEventListener('click', () => this.submit(true));

			const notYetBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-secondary',
				text: 'Submit (not yet)'
			});
			notYetBtn.addEventListener('click', () => this.submit(false));
		} else {
			const submitBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Submit'
			});
			submitBtn.addEventListener('click', () => this.submit(false));
		}
	}

	private renderSlider(
		container: HTMLElement,
		label: string,
		description: string | null,
		min: number,
		max: number,
		initial: number,
		onChange: (val: number) => void,
		leftLabel?: string,
		rightLabel?: string
	) {
		const group = container.createDiv({ cls: 'emerald-form-group' });
		const labelRow = group.createDiv({ cls: 'emerald-form-label-row' });
		const labelEl = labelRow.createEl('label', { text: label });
		const labelId = `emerald-slider-${label.replace(/\s+/g, '-').toLowerCase()}`;
		labelEl.id = labelId;
		const valueEl = labelRow.createSpan({ cls: 'emerald-slider-value', text: `${initial}/10` });

		if (description) {
			group.createDiv({ cls: 'emerald-form-desc', text: description });
		}

		// Endpoint labels row (above slider)
		if (leftLabel || rightLabel) {
			const endpointRow = group.createDiv({ cls: 'emerald-slider-endpoints' });
			endpointRow.createSpan({ cls: 'emerald-slider-endpoint-left', text: leftLabel ?? '' });
			endpointRow.createSpan({ cls: 'emerald-slider-endpoint-right', text: rightLabel ?? '' });
		}

		const slider = group.createEl('input', { cls: 'emerald-slider' });
		slider.type = 'range';
		slider.min = String(min);
		slider.max = String(max);
		slider.value = String(initial);
		slider.setAttribute('aria-labelledby', labelId);
		slider.setAttribute('aria-valuemin', String(min));
		slider.setAttribute('aria-valuemax', String(max));
		slider.setAttribute('aria-valuenow', String(initial));

		slider.addEventListener('input', () => {
			const val = parseInt(slider.value);
			valueEl.textContent = `${val}/10`;
			slider.setAttribute('aria-valuenow', String(val));
			onChange(val);
		});
	}

	private renderFlowButtons(container: HTMLElement) {
		const group = container.createDiv({ cls: 'emerald-form-group' });
		group.createEl('label', { text: 'Were you in the zone?' });

		const btnRow = group.createDiv({ cls: 'emerald-btn-group' });
		btnRow.setAttribute('role', 'radiogroup');
		btnRow.setAttribute('aria-label', 'Were you in the zone?');

		const options = [
			{ label: 'No', value: 0 },
			{ label: 'Somewhat', value: 1 },
			{ label: 'Yes', value: 2 }
		];

		for (const opt of options) {
			const btn = btnRow.createEl('button', {
				cls: 'emerald-btn-toggle',
				text: opt.label
			});
			btn.setAttribute('role', 'radio');
			btn.setAttribute('aria-checked', String(opt.value === this.flowOccurred));
			if (opt.value === this.flowOccurred) btn.addClass('is-active');

			btn.addEventListener('click', () => {
				this.flowOccurred = opt.value;
				btnRow.querySelectorAll('.emerald-btn-toggle').forEach(b => {
					b.removeClass('is-active');
					b.setAttribute('aria-checked', 'false');
				});
				btn.addClass('is-active');
				btn.setAttribute('aria-checked', 'true');
			});
		}
	}

	private renderEffortSource(container: HTMLElement) {
		const group = container.createDiv({ cls: 'emerald-form-group' });
		group.createEl('label', { text: 'What made it effortful?' });

		const sources = [
			{ key: 'complexity', label: 'Complexity' },
			{ key: 'emotional', label: 'Emotional drain' },
			{ key: 'motivation', label: 'High motivation cost' },
			{ key: 'novelty', label: 'Novelty / unfamiliarity' },
			{ key: 'physical', label: 'Physical demand' },
			{ key: 'uncertainty', label: 'Uncertainty' }
		];

		const grid = group.createDiv({ cls: 'emerald-source-grid' });
		grid.setAttribute('role', 'group');
		grid.setAttribute('aria-label', 'Effort sources (select all that apply)');

		for (const source of sources) {
			const chip = grid.createEl('button', {
				cls: 'emerald-source-chip',
				text: source.label
			});
			chip.setAttribute('aria-pressed', 'false');

			chip.addEventListener('click', () => {
				if (chip.hasClass('is-active')) {
					chip.removeClass('is-active');
					chip.setAttribute('aria-pressed', 'false');
					this.effortSource = this.effortSource.filter(s => s !== source.key);
				} else {
					chip.addClass('is-active');
					chip.setAttribute('aria-pressed', 'true');
					this.effortSource.push(source.key);
				}
			});
		}
	}

	private submit(markComplete: boolean) {
		const receipt: CreateReceiptPayload = {
			perceived_effort: this.perceivedEffort,
			hedonic_valence: this.hedonicValence,
			flow_occurred: this.flowOccurred,
			demand_investment_balance: this.demandInvestmentBalance,
			effort_source: this.effortSource.length > 0 ? this.effortSource : ['complexity'],
			notes: this.notes || undefined
		};

		this.onSubmit(receipt, markComplete);
		this.close();
	}

	private formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = Math.round(minutes % 60);
		if (h === 0) return `${m}m`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
