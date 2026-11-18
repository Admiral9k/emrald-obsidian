// Change ONE profile answer without retaking the whole queue (1.4.4; web twin: AnswerEditModal.svelte).
// The saved answer comes up selected and carries an amber "Current answer" tag; a green line under the question gives a
// direction hint (never a value) when the profile comparison flagged the question. Saves only this key through the
// existing PATCH /profile/questions route, which merges partial answers.

import { App, Modal } from 'obsidian';
import type EmraldPlugin from '../../main';
import { EDITABLE_BY_KEY, EDIT_COPY, AnswerValue, canSave, valueToSave } from './answer-edit-model';

/** The API client returns { error } instead of throwing. A queued (offline) write replays later, so it counts as saved. */
function isFailed(resp: { error?: string | null; queued?: boolean } | null | undefined): boolean {
	return !!resp && !!resp.error && !resp.queued;
}

export class AnswerEditModal extends Modal {
	private picked: AnswerValue | undefined;
	private saving = false;
	private saveBtn: HTMLButtonElement | null = null;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private plugin: EmraldPlugin,
		private qkey: string,
		private current: AnswerValue | undefined,
		private hint: string | null,
		private onSaved: () => void
	) {
		super(app);
		this.picked = current;
	}

	onOpen() {
		const q = EDITABLE_BY_KEY[this.qkey];
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');
		contentEl.addClass('emerald-ae-modal');
		if (!q) { this.close(); return; }

		contentEl.createEl('h2', { cls: 'emerald-onboard-title', text: EDIT_COPY.title });
		contentEl.createEl('p', { cls: 'emerald-ae-question', text: q.question });
		if (this.hint) contentEl.createEl('p', { cls: 'emerald-ae-hint', text: this.hint });
		this.errorEl = contentEl.createDiv({ cls: 'emerald-onboard-status is-error emrald-hidden' });
		this.errorEl.setAttribute('role', 'alert');

		const body = contentEl.createDiv({ cls: 'emerald-form' });
		if (q.kind === 'scale') {
			const row = body.createDiv({ cls: 'emerald-btn-group emerald-scale-row' });
			row.setAttribute('role', 'radiogroup');
			row.setAttribute('aria-label', q.question);
			const paint = () => {
				row.querySelectorAll('.emerald-scale-btn').forEach((b, i) => {
					const on = this.picked === i + 1;
					b.setAttribute('aria-checked', String(on));
					if (on) b.addClass('is-active'); else b.removeClass('is-active');
				});
			};
			for (let v = 1; v <= 5; v++) {
				const btn = row.createEl('button', { cls: 'emerald-btn-toggle emerald-scale-btn', text: String(v) });
				btn.setAttribute('role', 'radio');
				btn.addEventListener('click', () => { this.picked = v; paint(); this.sync(); });
			}
			paint();
			const ends = body.createDiv({ cls: 'emerald-slider-endpoints' });
			ends.createSpan({ cls: 'emerald-slider-endpoint-left', text: q.low ?? 'Low' });
			ends.createSpan({ cls: 'emerald-slider-endpoint-right', text: q.high ?? 'High' });
			if (typeof this.current === 'number') {
				const line = body.createEl('p', { cls: 'emerald-ae-current-line' });
				line.createSpan({ cls: 'emerald-ae-current-tag', text: EDIT_COPY.current });
				line.appendText(` ${this.current}`);
			}
		} else if (q.kind === 'text') {
			const area = body.createEl('textarea', { cls: 'emerald-ae-text' });
			area.rows = 3;
			area.maxLength = 500;
			area.setAttribute('aria-label', q.question);
			area.value = typeof this.picked === 'string' ? this.picked : '';
			area.addEventListener('input', () => { this.picked = area.value; this.sync(); });
		} else if (q.options) {
			const col = body.createDiv({ cls: 'emerald-onboard-enum-group' });
			for (const opt of q.options) {
				const btn = col.createEl('button', { cls: `emerald-onboard-enum-btn ${this.picked === opt.value ? 'is-active' : ''}` });
				btn.setAttribute('aria-pressed', String(this.picked === opt.value));
				if (opt.desc) {
					btn.createSpan({ cls: 'emerald-opt-label', text: opt.label });
					btn.createSpan({ cls: 'emerald-opt-desc', text: opt.desc });
				} else {
					btn.createSpan({ text: opt.label });
				}
				if (this.current === opt.value) btn.createSpan({ cls: 'emerald-ae-current-tag', text: EDIT_COPY.current });
				btn.addEventListener('click', () => {
					this.picked = opt.value;
					col.querySelectorAll('.emerald-onboard-enum-btn').forEach((b) => { b.removeClass('is-active'); b.setAttribute('aria-pressed', 'false'); });
					btn.addClass('is-active');
					btn.setAttribute('aria-pressed', 'true');
					this.sync();
				});
			}
		}

		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions emerald-calibration-actions' });
		const cancel = actions.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: EDIT_COPY.cancel });
		cancel.addEventListener('click', () => this.close());
		this.saveBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: EDIT_COPY.save });
		this.saveBtn.addEventListener('click', () => { void this.save(); });
		this.sync();
	}

	onClose() {
		this.contentEl.empty();
	}

	/** Save stays off until there is a real change. */
	private sync() {
		if (this.saveBtn) this.saveBtn.disabled = this.saving || !canSave(this.picked, this.current);
	}

	private async save() {
		const q = EDITABLE_BY_KEY[this.qkey];
		if (!q || this.saving || this.picked === undefined || !canSave(this.picked, this.current)) return;
		this.saving = true;
		this.errorEl?.addClass('emrald-hidden');
		this.sync();
		let failed = false;
		try {
			const resp = await this.plugin.apiClient.updateCalibration({ [this.qkey]: valueToSave(q, this.picked) });
			failed = isFailed(resp);
		} catch {
			failed = true;
		}
		this.saving = false;
		if (failed) {
			this.errorEl?.setText(EDIT_COPY.error);
			this.errorEl?.removeClass('emrald-hidden');
			this.sync();
			return;
		}
		this.close();
		this.onSaved();
	}
}
