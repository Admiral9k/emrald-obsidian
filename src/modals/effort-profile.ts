// EMRALD Per-Project Effort Profile Modal (SEQ-3, S97)
//
// Source of record: claw-vault/ClawEMRALD/Planning/SEQ-3-CAPTURE-DESIGN-S96.md
//
// Purpose: capture the user's PREDICTION about a project's shape (B-fields +
// duration estimate + optional motivation override), so EMRALD can later
// COMPARE it against the behavioral (receipt) data. Never fused — a
// separate layer, per design §2.
//
// Product shape (design §4/§10):
//   - Optional, not mandatory. Labeled "Experimental" for first ship.
//   - Gateway = the `multi_day` toggle on the parent project. This modal
//     is only OFFERED after a project is marked multi-day.
//   - Tiered form: CORE (clean counterparts) always visible + Extended
//     (moderate counterparts) behind an "Show experimental fields" toggle.
//   - Forecasting is HINT, never PRE-FILL (§10.1). Sliders start blank
//     (undefined) and don't submit unless the user actually moved them.
//     No auto-anchoring against past averages.

import { App, Modal, Notice } from 'obsidian';
import EmraldPlugin from '../../main';
import { EffortProfileUpdate, ItemEffortProfile, TrackedItem } from '../api/client';

type MotivationContext = 'job' | 'family' | 'personal' | 'social' | null;
type ModifierDirection = 'up' | 'down' | 'neutral' | null;

interface DraftState {
	// Duration (CORE, existing field revived)
	duration_estimate_hours: number | null;

	// CORE B-fields (clean counterparts)
	task_complexity_intrinsic: number | null;
	expertise_match: number | null;
	autotelic_rating: number | null;

	// Motivation override (CORE, existing)
	motivation_context: MotivationContext;
	motivation_override: number | null;
	modifier_direction: ModifierDirection;

	// EXTENDED B-fields (moderate counterparts)
	task_clarity: number | null;
	task_first_step_obvious: number | null;
	learning_investment: number | null;
	repetition_impact: number | null;
	task_novelty: number | null;

	// Interpretation-only (feeds insight text)
	autonomy_level: number | null;
	purpose_alignment: number | null;

	// Warehouse-honestly (revived; label communicates no direct counterpart today)
	physical_demand: number | null;
	mental_demand: number | null;
	routine_level: number | null;
}

const EMPTY_DRAFT: DraftState = {
	duration_estimate_hours: null,
	task_complexity_intrinsic: null,
	expertise_match: null,
	autotelic_rating: null,
	motivation_context: null,
	motivation_override: null,
	modifier_direction: null,
	task_clarity: null,
	task_first_step_obvious: null,
	learning_investment: null,
	repetition_impact: null,
	task_novelty: null,
	autonomy_level: null,
	purpose_alignment: null,
	physical_demand: null,
	mental_demand: null,
	routine_level: null,
};

export class EffortProfileModal extends Modal {
	private plugin: EmraldPlugin;
	private item: TrackedItem;
	private existing: ItemEffortProfile | null;
	private onSaved: (profile: ItemEffortProfile) => void;

	private draft: DraftState;
	private showExtended = false;
	private extendedContainer: HTMLElement | null = null;
	private extendedToggle: HTMLButtonElement | null = null;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		item: TrackedItem,
		existing: ItemEffortProfile | null,
		onSaved: (profile: ItemEffortProfile) => void
	) {
		super(app);
		this.plugin = plugin;
		this.item = item;
		this.existing = existing;
		this.onSaved = onSaved;
		this.draft = this.seedDraft(existing);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-effort-profile-modal');

		// Header
		contentEl.createEl('h2', { text: 'Effort profile' });
		const subtitleRow = contentEl.createDiv({ cls: 'emerald-modal-subtitle-row' });
		subtitleRow.createSpan({ cls: 'emerald-modal-subtitle', text: this.item.name });
		subtitleRow.createSpan({
			cls: 'emerald-pill emerald-pill-experimental',
			text: 'Experimental',
		});

		// Preamble — explain what this is for, honestly
		const preamble = contentEl.createDiv({ cls: 'emerald-form-desc emerald-effort-profile-preamble' });
		preamble.createEl('p', {
			text: 'Your best guess about how this project will feel. All fields are optional — leave any slider untouched to skip it. Later, EMRALD compares your predictions to how it actually played out, so you can hone your estimating instincts.',
		});
		preamble.createEl('p', {
			cls: 'emerald-form-note',
			text: 'This is a separate layer from your session data — it never gets mixed into your metrics.',
		});

		const form = contentEl.createDiv({ cls: 'emerald-form emerald-effort-profile-form' });

		// ── CORE block ─────────────────────────────────────────────
		this.renderSectionHeader(form, 'Core', 'Clean prediction vs. actual comparisons.');

		this.renderHoursInput(
			form,
			'Estimated total hours',
			'Roughly how many hours of focused work you think this project needs, all-in.',
			'duration_estimate_hours'
		);

		this.renderSlider(
			form,
			'Task complexity',
			'How intrinsically hard is this project — regardless of how good you are at it?',
			'task_complexity_intrinsic',
			'Simple',
			'Very complex'
		);

		this.renderSlider(
			form,
			'Expertise match',
			'How well does your current skill level match what this project asks for?',
			'expertise_match',
			'Way over my head',
			'Well within my skill'
		);

		this.renderSlider(
			form,
			'Autotelic rating',
			'How much do you expect the work itself — not the outcome — to be its own reward?',
			'autotelic_rating',
			'Purely a means',
			'Intrinsically enjoyable'
		);

		// Motivation override (compact triplet — context + strength + direction)
		this.renderMotivationOverride(form);

		// ── EXTENDED block toggle ─────────────────────────────────
		const toggleRow = form.createDiv({ cls: 'emerald-effort-profile-toggle-row' });
		this.extendedToggle = toggleRow.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary emerald-effort-profile-toggle',
			text: 'Show experimental fields',
		});
		toggleRow.createSpan({
			cls: 'emerald-form-note',
			text: 'Extra predictions we\'re still learning how to use. Optional.',
		});

		this.extendedContainer = form.createDiv({ cls: 'emerald-effort-profile-extended emrald-hidden' });
		this.renderExtendedSection(this.extendedContainer);

		this.extendedToggle.addEventListener('click', () => this.toggleExtended());

		// ── Actions ────────────────────────────────────────────────
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		const cancelBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Cancel',
		});
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: this.existing ? 'Save changes' : 'Save profile',
		});
		saveBtn.addEventListener('click', () => { void this.submit(saveBtn); });
	}

	// ── Rendering helpers ──────────────────────────────────────────

	private renderSectionHeader(container: HTMLElement, title: string, desc: string) {
		const wrap = container.createDiv({ cls: 'emerald-effort-profile-section-header' });
		wrap.createEl('h3', { text: title });
		wrap.createEl('p', { cls: 'emerald-form-desc', text: desc });
	}

	private renderHoursInput(
		container: HTMLElement,
		label: string,
		desc: string,
		field: 'duration_estimate_hours'
	) {
		const group = container.createDiv({ cls: 'emerald-form-group' });
		const labelRow = group.createDiv({ cls: 'emerald-form-label-row' });
		const labelEl = labelRow.createEl('label', { text: label });
		const labelId = `emerald-input-${field}`;
		labelEl.id = labelId;
		const valueEl = labelRow.createSpan({
			cls: 'emerald-slider-value',
			text: this.draft[field] != null ? `${this.draft[field]} h` : 'not set',
		});

		group.createDiv({ cls: 'emerald-form-desc', text: desc });

		const input = group.createEl('input', { cls: 'emerald-text-input emerald-hours-input' });
		input.type = 'number';
		input.min = '0';
		input.max = '9999';
		input.step = '0.5';
		input.placeholder = 'Example: 12';
		input.setAttribute('aria-labelledby', labelId);
		if (this.draft[field] != null) input.value = String(this.draft[field]);

		input.addEventListener('input', () => {
			const raw = input.value.trim();
			if (raw === '') {
				this.draft[field] = null;
				valueEl.textContent = 'Not set';
				return;
			}
			const n = parseFloat(raw);
			if (!Number.isFinite(n) || n < 0 || n > 9999) {
				valueEl.textContent = 'Invalid';
				this.draft[field] = null;
				return;
			}
			this.draft[field] = n;
			valueEl.textContent = `${n} h`;
		});
	}

	private renderSlider(
		container: HTMLElement,
		label: string,
		desc: string,
		field: keyof DraftState,
		leftLabel: string,
		rightLabel: string
	) {
		const group = container.createDiv({ cls: 'emerald-form-group' });
		const labelRow = group.createDiv({ cls: 'emerald-form-label-row' });
		const labelEl = labelRow.createEl('label', { text: label });
		const labelId = `emerald-slider-${String(field)}`;
		labelEl.id = labelId;

		const initial = this.draft[field] as number | null;
		const valueEl = labelRow.createSpan({
			cls: 'emerald-slider-value',
			text: initial != null ? `${initial}/10` : 'not set',
		});

		group.createDiv({ cls: 'emerald-form-desc', text: desc });

		const endpointRow = group.createDiv({ cls: 'emerald-slider-endpoints' });
		endpointRow.createSpan({ cls: 'emerald-slider-endpoint-left', text: leftLabel });
		endpointRow.createSpan({ cls: 'emerald-slider-endpoint-right', text: rightLabel });

		const slider = group.createEl('input', { cls: 'emerald-slider' });
		slider.type = 'range';
		slider.min = '1';
		slider.max = '10';
		slider.step = '1';
		// Anti-anchoring (design §10.1): if we don't have a saved value, sit the
		// thumb visually at midpoint but treat it as unset until the user moves it.
		slider.value = String(initial ?? 5);
		if (initial == null) slider.addClass('is-unset');
		slider.setAttribute('aria-labelledby', labelId);
		slider.setAttribute('aria-valuemin', '1');
		slider.setAttribute('aria-valuemax', '10');
		slider.setAttribute('aria-valuenow', String(initial ?? 5));

		slider.addEventListener('input', () => {
			const val = parseInt(slider.value, 10);
			slider.removeClass('is-unset');
			valueEl.textContent = `${val}/10`;
			slider.setAttribute('aria-valuenow', String(val));
			(this.draft as unknown as Record<string, number | null>)[String(field)] = val;
		});
	}

	private renderMotivationOverride(container: HTMLElement) {
		const group = container.createDiv({ cls: 'emerald-form-group' });
		group.createEl('label', { text: 'Motivation override (optional)' });
		group.createDiv({
			cls: 'emerald-form-desc',
			text: 'If this project pulls you above or below your usual motivation, note it here. Adjusts effort estimates.',
		});

		// Context (single-select buttons)
		const contextRow = group.createDiv({ cls: 'emerald-btn-group' });
		contextRow.setAttribute('role', 'radiogroup');
		contextRow.setAttribute('aria-label', 'Motivation context');
		const contexts: Array<{ label: string; value: MotivationContext }> = [
			{ label: 'Job', value: 'job' },
			{ label: 'Family', value: 'family' },
			{ label: 'Personal', value: 'personal' },
			{ label: 'Social', value: 'social' },
		];
		for (const opt of contexts) {
			const btn = contextRow.createEl('button', { cls: 'emerald-btn-toggle', text: opt.label });
			btn.setAttribute('role', 'radio');
			btn.setAttribute('aria-checked', String(this.draft.motivation_context === opt.value));
			if (this.draft.motivation_context === opt.value) btn.addClass('is-active');
			btn.addEventListener('click', () => {
				this.draft.motivation_context = this.draft.motivation_context === opt.value ? null : opt.value;
				contextRow.querySelectorAll('.emerald-btn-toggle').forEach((b) => {
					b.removeClass('is-active');
					b.setAttribute('aria-checked', 'false');
				});
				if (this.draft.motivation_context === opt.value) {
					btn.addClass('is-active');
					btn.setAttribute('aria-checked', 'true');
				}
			});
		}

		// Direction (up/neutral/down)
		const dirRow = group.createDiv({ cls: 'emerald-btn-group emerald-btn-group-tight' });
		dirRow.setAttribute('role', 'radiogroup');
		dirRow.setAttribute('aria-label', 'Motivation direction');
		const dirs: Array<{ label: string; value: ModifierDirection }> = [
			{ label: '↓ Below usual', value: 'down' },
			{ label: '≈ Neutral', value: 'neutral' },
			{ label: '↑ Above usual', value: 'up' },
		];
		for (const opt of dirs) {
			const btn = dirRow.createEl('button', { cls: 'emerald-btn-toggle', text: opt.label });
			btn.setAttribute('role', 'radio');
			btn.setAttribute('aria-checked', String(this.draft.modifier_direction === opt.value));
			if (this.draft.modifier_direction === opt.value) btn.addClass('is-active');
			btn.addEventListener('click', () => {
				this.draft.modifier_direction = this.draft.modifier_direction === opt.value ? null : opt.value;
				dirRow.querySelectorAll('.emerald-btn-toggle').forEach((b) => {
					b.removeClass('is-active');
					b.setAttribute('aria-checked', 'false');
				});
				if (this.draft.modifier_direction === opt.value) {
					btn.addClass('is-active');
					btn.setAttribute('aria-checked', 'true');
				}
			});
		}

		// Strength (1-10 slider), rendered as a plain field on draft
		this.renderSlider(
			group,
			'Override strength',
			'How strong is this deviation from your usual motivation?',
			'motivation_override',
			'Barely',
			'Very strong'
		);
	}

	private renderExtendedSection(container: HTMLElement) {
		this.renderSectionHeader(
			container,
			'Extended (experimental)',
			'Moderate-quality comparisons and interpretation cues. Optional, and still being learned.'
		);

		this.renderSlider(container, 'Task clarity', 'How clear is what \u201Cdone\u201D looks like?',
			'task_clarity', 'Vague', 'Crystal clear');
		this.renderSlider(container, 'First step obvious', 'How obvious is the very first concrete action to take?',
			'task_first_step_obvious', 'Not obvious', 'Very obvious');
		this.renderSlider(container, 'Learning investment', 'How much of this project is climbing a learning curve?',
			'learning_investment', 'None', 'Mostly learning');
		this.renderSlider(container, 'Repetition impact', 'How much will repeating sessions make this feel easier?',
			'repetition_impact', 'No easier', 'Much easier');
		this.renderSlider(container, 'Task novelty', 'How new is this kind of work to you?',
			'task_novelty', 'Familiar', 'Brand new');
		this.renderSlider(container, 'Autonomy', 'How much control do you have over how the work is done?',
			'autonomy_level', 'Prescribed', 'Total autonomy');
		this.renderSlider(container, 'Purpose alignment', 'How aligned is this with what matters to you?',
			'purpose_alignment', 'Not aligned', 'Deeply aligned');

		container.createEl('p', {
			cls: 'emerald-form-note',
			text: 'The three below are collected to improve future insights — no direct comparison metric yet.',
		});
		this.renderSlider(container, 'Physical demand', 'How physically demanding is this project?',
			'physical_demand', 'Sedentary', 'Very physical');
		this.renderSlider(container, 'Mental demand', 'How mentally demanding is this project?',
			'mental_demand', 'Light', 'Very heavy');
		this.renderSlider(container, 'Routine level', 'How repetitive is this project?',
			'routine_level', 'Novel every time', 'Very routine');
	}

	private toggleExtended() {
		if (!this.extendedContainer || !this.extendedToggle) return;
		this.showExtended = !this.showExtended;
		if (this.showExtended) {
			this.extendedContainer.removeClass('emrald-hidden');
		} else {
			this.extendedContainer.addClass('emrald-hidden');
		}
		this.extendedToggle.setText(this.showExtended ? 'Hide experimental fields' : 'Show experimental fields');
	}

	// ── Draft handling & submit ────────────────────────────────────

	private seedDraft(existing: ItemEffortProfile | null): DraftState {
		if (!existing) return { ...EMPTY_DRAFT };
		const seeded: DraftState = { ...EMPTY_DRAFT };
		const src = existing as unknown as Record<string, unknown>;
		for (const key of Object.keys(EMPTY_DRAFT) as Array<keyof DraftState>) {
			const val = src[key as string];
			if (val === undefined || val === null) continue;
			if (key === 'motivation_context') {
				if (val === 'job' || val === 'family' || val === 'personal' || val === 'social') {
					seeded.motivation_context = val;
				}
				continue;
			}
			if (key === 'modifier_direction') {
				if (val === 'up' || val === 'down' || val === 'neutral') {
					seeded.modifier_direction = val;
				}
				continue;
			}
			if (typeof val === 'number' && Number.isFinite(val)) {
				(seeded as unknown as Record<string, number | null>)[key as string] = val;
			}
		}
		return seeded;
	}

	private buildPayload(): EffortProfileUpdate {
		// Only include fields the user actually set. Sending `null` on a field
		// they didn't touch would nuke a previous value on re-open.
		const payload: EffortProfileUpdate = {};
		for (const key of Object.keys(this.draft) as Array<keyof DraftState>) {
			const val = this.draft[key];
			if (val === null || val === undefined) continue;
			(payload as unknown as Record<string, unknown>)[key as string] = val;
		}
		return payload;
	}

	private async submit(saveBtn: HTMLButtonElement) {
		const payload = this.buildPayload();
		if (Object.keys(payload).length === 0) {
			new Notice('Nothing to save — set at least one field first.');
			return;
		}

		saveBtn.disabled = true;
		saveBtn.setText('Saving…');

		const resp = await this.plugin.apiClient.patchEffortProfile(this.item.id, payload);
		if (resp.error || !resp.data) {
			new Notice(`Couldn\u2019t save effort profile: ${resp.error ?? 'unknown error'}`);
			saveBtn.disabled = false;
			saveBtn.setText(this.existing ? 'Save changes' : 'Save profile');
			return;
		}

		new Notice('Effort profile saved.');
		this.onSaved(resp.data);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
