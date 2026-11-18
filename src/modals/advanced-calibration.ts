// EMRALD Advanced Calibration Modal
// Presented at session start when user is in Advanced mode with remaining questions.
// Shows 3-5 questions per session, tracks progress via advanced_questions_remaining.

import { App, Modal, Notice } from 'obsidian';
import EmraldPlugin from '../../main';

import { ADVANCED_QUESTIONS, CalibrationQuestion } from '../onboarding/advanced-questions';

const QUESTIONS_PER_SESSION = 4;

export class AdvancedCalibrationModal extends Modal {
	private plugin: EmraldPlugin;
	private questions: CalibrationQuestion[];
	private allUnanswered: CalibrationQuestion[];
	private answers: Record<string, unknown> = {};
	private onComplete: () => void;
	private onSkip: () => void;
	private remaining: number;
	private showAll: boolean = false;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		answeredKeys: string[],
		remaining: number,
		onComplete: () => void,
		onSkip: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.onComplete = onComplete;
		this.onSkip = onSkip;
		this.remaining = remaining;

		// Filter out already-answered questions
		this.allUnanswered = ADVANCED_QUESTIONS
			.filter(q => !answeredKeys.includes(q.key));

		// Default: take next batch
		this.questions = this.allUnanswered.slice(0, QUESTIONS_PER_SESSION);
	}

	onOpen() {
		this.renderContent();
	}

	private renderContent() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-calibration-modal');

		// If showAll, use all unanswered; otherwise use the batch
		const displayQuestions = this.showAll ? this.allUnanswered : this.questions;

		contentEl.createEl('h2', { text: 'Effort profile: advanced' });

		const remainingAfter = Math.max(this.remaining - displayQuestions.length, 0);
		if (this.showAll) {
			contentEl.createEl('p', {
				cls: 'emerald-modal-subtitle',
				text: `All ${displayQuestions.length} remaining questions. Take your time.`
			});
		} else {
			contentEl.createEl('p', {
				cls: 'emerald-modal-subtitle',
				text: `${displayQuestions.length} quick questions before your session. ${remainingAfter} remaining after this.`
			});

			// "Answer all at once" toggle
			if (this.allUnanswered.length > QUESTIONS_PER_SESSION) {
				const allBtn = contentEl.createEl('button', {
					cls: 'emerald-btn emerald-btn-subtle emerald-btn-sm',
					text: `Answer all ${this.allUnanswered.length} remaining at once`
				});
				allBtn.addEventListener('click', () => {
					this.showAll = true;
					this.renderContent();
				});
			}
		}

		const form = contentEl.createDiv({ cls: 'emerald-form' });

		let optionalSeparatorShown = false;
		for (const q of displayQuestions) {
			// Insert separator before the first optional/future-integration question
			if (q.optional && !optionalSeparatorShown) {
				optionalSeparatorShown = true;
				form.createEl('hr', { cls: 'emerald-form-separator' });
				form.createDiv({
					cls: 'emerald-form-desc emerald-text-muted',
					text: 'Questions below are for future integrations, answers optional.'
				});
			}
			const group = form.createDiv({ cls: 'emerald-form-group' });
			group.createEl('label', { text: q.question });

			if (q.type === 'slider') {
				const currentVal = (q.default as number) ?? 3;
				const labelRow = group.createDiv({ cls: 'emerald-form-label-row' });
				const valueEl = labelRow.createSpan({ cls: 'emerald-slider-value', text: `${currentVal}/5` });

				if (q.endpointLeft || q.endpointRight) {
					const endpoints = group.createDiv({ cls: 'emerald-slider-endpoints' });
					endpoints.createSpan({ cls: 'emerald-slider-endpoint-left', text: q.endpointLeft ?? '' });
					endpoints.createSpan({ cls: 'emerald-slider-endpoint-right', text: q.endpointRight ?? '' });
				}

				const slider = group.createEl('input', { cls: 'emerald-slider' });
				slider.type = 'range';
				slider.min = String(q.min ?? 1);
				slider.max = String(q.max ?? 5);
				slider.value = String(currentVal);

				const key = q.key;
				this.answers[key] = currentVal;
				slider.addEventListener('input', () => {
					const val = parseInt(slider.value);
					valueEl.textContent = `${val}/5`;
					this.answers[key] = val;
				});

			} else if (q.type === 'enum' && q.options) {
				const btnColumn = group.createDiv({ cls: 'emerald-onboard-enum-group' });
				for (const opt of q.options) {
					const btn = btnColumn.createEl('button', {
						cls: 'emerald-onboard-enum-btn',
						text: opt.label
					});
					const key = q.key;
					btn.addEventListener('click', () => {
						this.answers[key] = opt.value;
						btnColumn.querySelectorAll('.emerald-onboard-enum-btn').forEach(b => b.removeClass('is-active'));
						btn.addClass('is-active');
					});
				}

			} else if (q.type === 'text') {
				const input = group.createEl('input', {
					cls: 'emerald-onboard-input',
					type: 'text',
					placeholder: 'Type your answer...'
				});
				const key = q.key;
				input.addEventListener('input', () => {
					const val = input.value.trim();
					if (val) {
						this.answers[key] = val;
					} else {
						delete this.answers[key];
					}
				});
			}
		}

		// Actions
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		const submitBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Save & continue'
		});
		submitBtn.addEventListener('click', () => { void (async () => {
			try {
				const answeredCount = Object.keys(this.answers).length;
				if (answeredCount > 0) {
					try {
						await this.plugin.apiClient.updateCalibration(this.answers);
						new Notice(`${answeredCount} answers saved ✓`);
					} catch { /* non-fatal — answers saved locally */ }
				}

				const remainingRequired = this.allUnanswered.filter(q => !q.optional);
				const answeredRequired = remainingRequired.filter(q => this.answers[q.key] !== undefined);
				if (remainingRequired.length > 0 && answeredRequired.length === remainingRequired.length) {
					this.plugin.settings.advancedProfileCompleted = true;
					await this.plugin.saveSettings();
					this.close();
					const { AdvancedCompleteModal } = await import('./advanced-complete');
					const completeModal = new AdvancedCompleteModal(this.app, () => {
						this.onComplete();
					});
					completeModal.open();
					return;
				}

				this.close();
				this.onComplete();
			} catch { /* non-fatal */ }
		})(); });

		const skipBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: 'Skip for now'
		});
		skipBtn.addEventListener('click', () => {
			this.close();
			this.onSkip();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Check if user should see Advanced calibration questions before session start.
 * Returns null if no questions needed, or the list of already-answered keys + remaining count.
 */
export async function checkAdvancedCalibrationNeeded(
	plugin: EmraldPlugin
): Promise<{ answeredKeys: string[]; remaining: number } | null> {
	try {
		if (plugin.settings.advancedProfileCompleted) return null;

		const profileResp = await plugin.apiClient.getProfile();
		if (!profileResp.data) return null;

		const profile = profileResp.data as Record<string, unknown>;

		// Only show if user has opted into Advanced mode
		if (profile.question_mode !== 'advanced') return null;

		// Build list of already-answered keys from advanced_answers
		const advancedAnswers = profile.advanced_answers ?? {};
		const answeredKeys = Object.keys(advancedAnswers);

		// Only REQUIRED advanced questions should block session start.
		// Optional import questions can remain blank without re-triggering the modal.
		const requiredKeys = ADVANCED_QUESTIONS.filter(q => !q.optional).map(q => q.key);
		const actualRemaining = requiredKeys.filter(k => !answeredKeys.includes(k)).length;

		if (actualRemaining <= 0) return null;

		return { answeredKeys, remaining: actualRemaining };
	} catch { /* non-fatal */
		return null;
	}
}

/**
 * Get the total number of Advanced questions.
 */
export function getAdvancedQuestionCount(): number {
	return ADVANCED_QUESTIONS.length;
}
