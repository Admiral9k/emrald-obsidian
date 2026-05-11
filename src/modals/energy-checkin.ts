// EMRALD Energy Check-in Modal
// Morning energy assessment: sleep quality, hours, physical/emotional/mental energy.
// Opens once per day — duplicate guard via API 409 + local check.
// Spec: all scales 1-10 except hours.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';
import { CreateEnergyCheckinPayload } from '../api/client';

export interface CheckinWithRecovery extends CreateEnergyCheckinPayload {
	recovery_yesterday?: boolean;
	recovery_effectiveness?: number; // 1-3
}

export class EnergyCheckinModal extends Modal {
	private plugin: EmraldPlugin;
	private onSubmit: (checkin: CheckinWithRecovery) => void;

	private sleepQuality: number = 5;
	private sleepHours: number = 7;
	private physicalEnergy: number = 5;
	private emotionalEnergy: number = 5;
	private mentalClarity: number = 5;
	private notes: string = '';
	private recoveryYesterday: boolean = false;
	private recoveryEffectiveness: number = 2; // 1=Low, 2=Moderate, 3=High

	constructor(
		app: App,
		plugin: EmraldPlugin,
		onSubmit: (checkin: CheckinWithRecovery) => void
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-checkin-modal');

		// Show loading while checking duplicate status
		const loadingEl = contentEl.createDiv({ cls: 'emerald-loading' });
		loadingEl.createDiv({ cls: 'emerald-spinner' });
		loadingEl.createDiv({ cls: 'emerald-loading-text', text: "Checking today's status..." });

		// Duplicate guard — check if already submitted today
		const todayResp = await this.plugin.apiClient.getTodayCheckin();
		loadingEl.remove();

		if (todayResp.data) {
			contentEl.createEl('h2', { text: 'Already checked in ✓' });
			contentEl.createEl('p', {
				cls: 'emerald-modal-subtitle',
				text: "You've already submitted your energy check-in today. Come back tomorrow!"
			});
			const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });
			const closeBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: 'Got it' });
			closeBtn.addEventListener('click', () => this.close());
			return;
		}

		contentEl.createEl('h2', { text: 'Daily check-in' });
		contentEl.createEl('p', { cls: 'emerald-modal-subtitle', text: 'How are you feeling today?' });

		const form = contentEl.createDiv({ cls: 'emerald-form' });

		// Sleep Quality (1-10)
		this.renderSlider(form, 'Sleep Quality', 'How well did you sleep?', 1, 10, 5, (val) => {
			this.sleepQuality = val;
		}, false, 'Awful', 'Like a baby');

		// Sleep Hours (4-12, step 0.5)
		this.renderSlider(form, 'Hours Slept', null, 4, 12, 7, (val) => {
			this.sleepHours = val;
		}, true);

		// Physical Energy (1-10)
		this.renderSlider(form, 'Physical Energy', 'Body feel rested?', 1, 10, 5, (val) => {
			this.physicalEnergy = val;
		}, false, 'Drained', 'Energized');

		// Emotional State (1-10)
		this.renderSlider(form, 'Emotional State', "How's your mood?", 1, 10, 5, (val) => {
			this.emotionalEnergy = val;
		}, false, 'Struggling', 'Great');

		// Mental Clarity (1-10)
		this.renderSlider(form, 'Mental Clarity', 'Sharp or foggy?', 1, 10, 5, (val) => {
			this.mentalClarity = val;
		}, false, 'Foggy', 'Sharp');

		// Notes (optional)
		const notesGroup = form.createDiv({ cls: 'emerald-form-group' });
		notesGroup.createEl('label', { text: 'Notes (optional)' });
		const textarea = notesGroup.createEl('textarea', { cls: 'emerald-textarea' });
		textarea.placeholder = "Anything to note about today's energy?";
		textarea.addEventListener('input', () => {
			this.notes = textarea.value;
		});

		// ── Recovery Question ─────────────────────────────────
		const recoverySeparator = form.createDiv({ cls: 'emerald-form-separator' });
		recoverySeparator.createEl('hr');

		const recoveryGroup = form.createDiv({ cls: 'emerald-form-group' });
		const recoveryLabelRow = recoveryGroup.createDiv({ cls: 'emerald-form-label-row' });
		recoveryLabelRow.createEl('label', { text: 'Did you recharge yesterday?' });

		const recoveryToggle = recoveryLabelRow.createDiv({ cls: 'checkbox-container' });
		recoveryToggle.setAttribute('role', 'switch');
		recoveryToggle.setAttribute('aria-checked', 'false');
		recoveryToggle.setAttribute('aria-label', 'Did you recharge yesterday?');
		recoveryToggle.tabIndex = 0;
		recoveryToggle.addEventListener('click', () => {
			this.recoveryYesterday = !this.recoveryYesterday;
			recoveryToggle.toggleClass('is-enabled', this.recoveryYesterday);
			recoveryToggle.setAttribute('aria-checked', String(this.recoveryYesterday));
			if (this.recoveryYesterday) { effectivenessGroup.removeClass('emrald-hidden'); } else { effectivenessGroup.addClass('emrald-hidden'); }
		});
		recoveryToggle.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				recoveryToggle.click();
			}
		});

		recoveryGroup.createDiv({
			cls: 'emerald-form-desc',
			text: 'Rest, hobbies, exercise, anything that recharged your batteries.'
		});

		const effectivenessGroup = form.createDiv({ cls: 'emerald-form-group' });
		effectivenessGroup.addClass('emrald-hidden');
		effectivenessGroup.createEl('label', { text: 'How effective was it?' });

		const effRow = effectivenessGroup.createDiv({ cls: 'emerald-radio-group' });
		effRow.setAttribute('role', 'radiogroup');
		effRow.setAttribute('aria-label', 'How effective was your recovery?');
		const effOptions = [
			{ value: 1, label: 'Low', desc: 'Tried but still tired' },
			{ value: 2, label: 'Moderate', desc: 'Helped somewhat' },
			{ value: 3, label: 'High', desc: 'Felt genuinely recharged' },
		];
		for (const opt of effOptions) {
			const btn = effRow.createEl('button', {
				cls: `emerald-btn emerald-btn-radio${opt.value === 2 ? ' is-active' : ''}`,
				text: opt.label,
				attr: { title: opt.desc },
			});
			btn.setAttribute('role', 'radio');
			btn.setAttribute('aria-checked', String(opt.value === 2));
			btn.setAttribute('aria-label', `${opt.label} — ${opt.desc}`);
			btn.addEventListener('click', () => {
				this.recoveryEffectiveness = opt.value;
				effRow.querySelectorAll('.emerald-btn-radio').forEach(b => {
					b.removeClass('is-active');
					b.setAttribute('aria-checked', 'false');
				});
				btn.addClass('is-active');
				btn.setAttribute('aria-checked', 'true');
			});
		}

		// Actions
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		const submitBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: 'Submit' });
		submitBtn.addEventListener('click', () => this.submit());

		const skipBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-subtle', text: 'Skip for now' });
		skipBtn.addEventListener('click', () => this.close());
	}

	private renderSlider(
		container: HTMLElement,
		label: string,
		description: string | null,
		min: number,
		max: number,
		initial: number,
		onChange: (val: number) => void,
		halfSteps: boolean = false,
		lowLabel?: string,
		highLabel?: string
	) {
		const group = container.createDiv({ cls: 'emerald-form-group' });
		const labelRow = group.createDiv({ cls: 'emerald-form-label-row' });
		const labelEl = labelRow.createEl('label', { text: label });
		const labelId = `emerald-slider-${label.replace(/\s+/g, '-').toLowerCase()}`;
		labelEl.id = labelId;

		const displayVal = halfSteps ? `${initial}h` : String(initial);
		const valueEl = labelRow.createSpan({ cls: 'emerald-slider-value', text: displayVal });

		if (description) {
			group.createDiv({ cls: 'emerald-form-desc', text: description });
		}

		// Endpoint labels row (above slider)
		if (lowLabel || highLabel) {
			const endpointRow = group.createDiv({ cls: 'emerald-slider-endpoints' });
			endpointRow.createSpan({ cls: 'emerald-slider-endpoint-left', text: lowLabel ?? '' });
			endpointRow.createSpan({ cls: 'emerald-slider-endpoint-right', text: highLabel ?? '' });
		}

		const slider = group.createEl('input', { cls: 'emerald-slider' });
		slider.type = 'range';
		slider.min = String(halfSteps ? min * 2 : min);
		slider.max = String(halfSteps ? max * 2 : max);
		slider.value = String(halfSteps ? initial * 2 : initial);
		if (halfSteps) slider.step = '1'; // Each step = 0.5h
		slider.setAttribute('aria-labelledby', labelId);
		slider.setAttribute('aria-valuemin', String(min));
		slider.setAttribute('aria-valuemax', String(max));
		slider.setAttribute('aria-valuenow', String(initial));

		slider.addEventListener('input', () => {
			const raw = parseInt(slider.value);
			const val = halfSteps ? raw / 2 : raw;
			valueEl.textContent = halfSteps ? `${val}h` : String(val);
			slider.setAttribute('aria-valuenow', String(val));
			onChange(val);
		});
	}

	private submit() {
		const checkin: CheckinWithRecovery = {
			sleep_quality: this.sleepQuality,
			sleep_hours: this.sleepHours,
			physical_energy: this.physicalEnergy,
			emotional_state: this.emotionalEnergy,
			mental_clarity: this.mentalClarity,
			notes: this.notes || undefined,
			recovery_yesterday: this.recoveryYesterday || undefined,
			recovery_effectiveness: this.recoveryYesterday ? this.recoveryEffectiveness : undefined,
		};

		this.onSubmit(checkin);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
