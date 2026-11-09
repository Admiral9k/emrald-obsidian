// Custom E-Level Editor Modal
// Three jobs, one modal: create a custom level, rename one, or change its
// percent. Owns the API call so every e-levels error code is mapped to copy in
// exactly one place.
//
// Percent axis is 5–100 step 5. The reserved percents (25/50/75/100) belong to
// E1–E4, so the modal refuses them and points at the built-in instead —
// "snap-to-built-in", the client half of the frozen decision.

import { App, Modal, Notice, setIcon } from 'obsidian';
import EmraldPlugin from '../../main';
import type { CustomELevel } from '../api/client';
import {
	CUSTOM_BADGE,
	NAME_MAX_LENGTH,
	PERCENT_MAX,
	PERCENT_MIN,
	PERCENT_STEP,
	assumeReferenced,
	colorForPercent,
	eLevelStore,
	normalizePercent,
	refCountLabel,
	reservedBuiltInForPercent,
	validateCustomLevelName
} from '../e-levels';

export type ELevelEditorMode = 'create' | 'rename' | 'percent';

const TITLES: Record<ELevelEditorMode, string> = {
	create: 'New effort level',
	rename: 'Rename effort level',
	percent: 'Change percent'
};

export class CustomELevelEditorModal extends Modal {
	private plugin: EmraldPlugin;
	private mode: ELevelEditorMode;
	private level: CustomELevel | null;
	private onDone: () => void;

	private name: string;
	private percent: number;
	private submitting = false;

	private nameInput: HTMLInputElement | null = null;
	private slider: HTMLInputElement | null = null;
	private previewBadgeEl: HTMLElement | null = null;
	private previewTextEl: HTMLElement | null = null;
	private noticeEl: HTMLElement | null = null;
	private submitBtn: HTMLButtonElement | null = null;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		mode: ELevelEditorMode,
		level: CustomELevel | null,
		onDone: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.mode = mode;
		this.level = level;
		this.onDone = onDone;
		this.name = level?.name ?? '';
		// Default create percent sits between E1 and E2 so the first thing the
		// user sees is a legal, non-reserved value.
		this.percent = level ? normalizePercent(level.percent) : 40;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-elevel-editor-modal');

		contentEl.createEl('h2', { text: TITLES[this.mode] });

		const form = contentEl.createDiv({ cls: 'emerald-form' });

		// ── Name ────────────────────────────────────────
		if (this.mode === 'create' || this.mode === 'rename') {
			const nameGroup = form.createDiv({ cls: 'emerald-form-group' });
			nameGroup.createEl('label', { cls: 'emerald-form-label', text: 'Name' });
			this.nameInput = nameGroup.createEl('input', {
				cls: 'emerald-modal-name-input',
				type: 'text',
				placeholder: 'e.g. deep research'
			});
			this.nameInput.value = this.name;
			this.nameInput.maxLength = NAME_MAX_LENGTH;
			this.nameInput.addEventListener('input', () => {
				this.name = this.nameInput?.value ?? '';
				this.refreshPreview();
			});
			nameGroup.createDiv({
				cls: 'emerald-form-hint',
				text: `Up to ${NAME_MAX_LENGTH} characters. E1–E4 are reserved.`
			});
		}

		// ── Percent ─────────────────────────────────────
		if (this.mode === 'create' || this.mode === 'percent') {
			const pctGroup = form.createDiv({ cls: 'emerald-form-group' });
			pctGroup.createEl('label', { cls: 'emerald-form-label', text: 'Percent of your daily work time' });
			const row = pctGroup.createDiv({ cls: 'emerald-slider-row' });
			this.slider = row.createEl('input', { cls: 'emerald-slider', type: 'range' });
			this.slider.min = String(PERCENT_MIN);
			this.slider.max = String(PERCENT_MAX);
			this.slider.step = String(PERCENT_STEP);
			this.slider.value = String(this.percent);
			const valueEl = row.createSpan({ cls: 'emerald-slider-value', text: `${this.percent}%` });
			this.slider.addEventListener('input', () => {
				this.percent = normalizePercent(Number(this.slider?.value ?? this.percent));
				valueEl.textContent = `${this.percent}%`;
				this.refreshPreview();
			});
			const ends = pctGroup.createDiv({ cls: 'emerald-slider-endpoints' });
			ends.createSpan({ cls: 'emerald-slider-endpoint emerald-slider-endpoint-left', text: `${PERCENT_MIN}%` });
			ends.createSpan({ cls: 'emerald-slider-endpoint emerald-slider-endpoint-right', text: `${PERCENT_MAX}%` });
		}

		// ── Live preview ────────────────────────────────
		const preview = form.createDiv({ cls: 'emerald-elevel-preview' });
		this.previewBadgeEl = preview.createSpan({ cls: 'emerald-elevel-badge', text: CUSTOM_BADGE });
		this.previewTextEl = preview.createSpan({ cls: 'emerald-elevel-preview-text' });

		// ── Inline notice (snap / validation) ───────────
		this.noticeEl = form.createDiv({ cls: 'emerald-form-error emrald-hidden' });

		// ── Actions ─────────────────────────────────────
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });
		const cancelBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		this.submitBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: this.mode === 'create' ? 'Create level' : 'Save'
		});
		this.submitBtn.addEventListener('click', () => { void this.submit(); });

		this.nameInput?.focus();
		this.refreshPreview();
	}

	// ── Preview + gating ───────────────────────────────

	private refreshPreview(): void {
		const color = colorForPercent(this.percent);
		if (this.previewBadgeEl) this.previewBadgeEl.style.color = color;
		if (this.previewTextEl) {
			const shownName = this.name.trim() || 'Your level';
			this.previewTextEl.textContent = `${shownName} — ${this.percent}% of your daily work time`;
		}

		const problem = this.blockingProblem();
		if (this.noticeEl) {
			this.noticeEl.textContent = problem ?? '';
			if (problem) {
				this.noticeEl.removeClass('emrald-hidden');
			} else {
				this.noticeEl.addClass('emrald-hidden');
			}
		}
		if (this.submitBtn) this.submitBtn.disabled = !!problem || this.submitting;
	}

	/**
	 * The one reason submission is blocked, or null. Percent is checked first
	 * because the snap-to-built-in message is the more useful one to show.
	 */
	private blockingProblem(): string | null {
		if (this.mode === 'create' || this.mode === 'percent') {
			const reserved = reservedBuiltInForPercent(this.percent);
			if (reserved) {
				return `${this.percent}% is the built-in ${reserved}. Pick a different percent, or just assign ${reserved}.`;
			}
		}
		if (this.mode === 'create' || this.mode === 'rename') {
			return validateCustomLevelName(this.name, {
				levels: eLevelStore.all(),
				ignoreId: this.level?.id
			});
		}
		return null;
	}

	// ── Submit ─────────────────────────────────────────

	private async submit(): Promise<void> {
		if (this.submitting) return;
		const problem = this.blockingProblem();
		if (problem) {
			new Notice(problem);
			return;
		}

		this.submitting = true;
		this.setBusy(true);
		try {
			if (this.mode === 'create') {
				await this.runCreate();
			} else if (this.mode === 'rename') {
				await this.runRename();
			} else {
				await this.runPercent();
			}
		} finally {
			this.submitting = false;
			this.setBusy(false);
		}
	}

	private setBusy(busy: boolean): void {
		if (!this.submitBtn) return;
		this.submitBtn.disabled = busy;
		this.submitBtn.textContent = busy
			? 'Saving…'
			: (this.mode === 'create' ? 'Create level' : 'Save');
	}

	private async runCreate(): Promise<void> {
		const resp = await this.plugin.apiClient.createELevel(this.name.trim(), this.percent);
		if (resp.queued) {
			new Notice('You\'re offline — this level will be created when you reconnect.');
			this.close();
			return;
		}
		if (resp.error || !resp.data) {
			this.showApiError(resp.error, resp.errorCode, resp.status);
			return;
		}
		eLevelStore.upsert(resp.data);
		await this.afterMutation();
		new Notice(`Created ${resp.data.name} (${resp.data.percent}%)`);
		this.close();
	}

	private async runRename(): Promise<void> {
		if (!this.level) return;
		const resp = await this.plugin.apiClient.renameELevel(this.level.id, this.name.trim());
		if (resp.queued) {
			new Notice('You\'re offline — the rename will sync when you reconnect.');
			this.close();
			return;
		}
		if (resp.error || !resp.data) {
			this.showApiError(resp.error, resp.errorCode, resp.status);
			return;
		}
		eLevelStore.upsert(resp.data);
		await this.afterMutation();
		new Notice(`Renamed to ${resp.data.name}`);
		this.close();
	}

	private async runPercent(): Promise<void> {
		if (!this.level) return;
		const resp = await this.plugin.apiClient.changeELevelPercent(this.level.id, this.percent);
		if (resp.queued) {
			new Notice('You\'re offline — the change will sync when you reconnect.');
			this.close();
			return;
		}
		if (resp.error || !resp.data) {
			this.showApiError(resp.error, resp.errorCode, resp.status);
			return;
		}
		eLevelStore.upsert(resp.data);
		await this.afterMutation();
		new Notice(`${resp.data.name} is now ${resp.data.percent}%`);
		this.close();
	}

	/** Refresh the cache from the server after a mutation, then redraw callers. */
	private async afterMutation(): Promise<void> {
		eLevelStore.invalidate();
		await eLevelStore.refresh(this.plugin);
		this.onDone();
	}

	/**
	 * Map the frozen error contract onto copy. Server messages win wherever the
	 * server names the offending field or explains the lock — the client only
	 * supplies a fallback and, for REF_COUNT_UNAVAILABLE, a retry affordance.
	 */
	private showApiError(error: string | null, code: string | null | undefined, status: number): void {
		let message = error ?? 'Something went wrong — try again.';
		let retryable = false;

		switch (code) {
			case 'PRO_REQUIRED':
				message = 'Custom e-levels are a PRO feature. Upgrade at effortmastery.com/pro';
				break;
			case 'VALIDATION_ERROR':
			case 'CONFLICT':
				// Server names the conflicting field — show it verbatim.
				break;
			case 'PERCENT_LOCKED':
				// Server explains which projects hold the level.
				break;
			case 'REF_COUNT_UNAVAILABLE':
				message = `${error ?? 'Could not check how many projects use this level.'} Try again in a moment.`;
				retryable = true;
				break;
			case 'NOT_FOUND':
				message = 'That level no longer exists.';
				break;
			default:
				if (status === 403) message = 'Custom e-levels are a PRO feature. Upgrade at effortmastery.com/pro';
				break;
		}

		if (this.noticeEl) {
			this.noticeEl.empty();
			const icon = this.noticeEl.createSpan({ cls: 'emerald-form-error-icon' });
			setIcon(icon, 'alert-circle');
			this.noticeEl.createSpan({ text: ` ${message}` });
			if (retryable) {
				const retry = this.noticeEl.createEl('button', { cls: 'emerald-btn-link', text: 'Retry' });
				retry.addEventListener('click', () => { void this.submit(); });
			}
			this.noticeEl.removeClass('emrald-hidden');
		}
		new Notice(message);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Removal confirmation. "Remove" is one client intent — the server decides
 * archive vs delete — so the copy has to prepare the user for either outcome
 * based on the reference count we know about.
 */
export class ConfirmRemoveELevelModal extends Modal {
	private level: CustomELevel;
	private onConfirm: () => void;

	constructor(app: App, level: CustomELevel, onConfirm: () => void) {
		super(app);
		this.level = level;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-elevel-editor-modal');

		contentEl.createEl('h2', { text: 'Remove effort level' });

		const referenced = assumeReferenced(this.level.ref_count);
		const body = contentEl.createDiv({ cls: 'emerald-modal-body' });
		body.createEl('p', {
			text: referenced
				? `"${this.level.name}" is ${refCountLabel(this.level.ref_count)}, so EMRALD will archive it. Those projects keep their label, but you won't be able to assign it to anything new.`
				: `Nothing is using "${this.level.name}", so it will be deleted outright.`
		});

		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });
		const cancelBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const removeBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-danger', text: 'Remove' });
		removeBtn.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
