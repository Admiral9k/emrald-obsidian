// EMRALD Advanced Calibration Modal
// Presented at session start when user is in Advanced mode with remaining questions.
// Shows 3-5 questions per session, tracks progress via advanced_questions_remaining.

import { App, Modal, Notice } from 'obsidian';
import EmraldPlugin from '../../main';

// All 30 Advanced questions (Q14–Q43), ordered for gradual presentation
interface CalibrationQuestion {
	key: string;
	question: string;
	type: 'slider' | 'enum' | 'text' | 'multi-enum';
	options?: Array<{ value: string; label: string }>;
	min?: number;
	max?: number;
	default?: any;
	endpointLeft?: string;
	endpointRight?: string;
	optional?: boolean;
}

const ADVANCED_QUESTIONS: CalibrationQuestion[] = [
	// Batch 1 (Sessions 2-3): Personality deep-dive
	{
		key: 'interest_consistency',
		question: 'I often set goals but later choose to pursue different ones.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Never', endpointRight: 'Constantly'
	},
	{
		key: 'achievement_drive',
		question: 'I maintain effort on long projects even when progress is slow.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Rarely', endpointRight: 'Always'
	},
	{
		key: 'impulsiveness',
		question: 'I tend to act on impulse rather than thinking things through.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Never', endpointRight: 'Very often'
	},
	{
		key: 'structure_preference',
		question: 'I prefer clear plans and structure over flexible situations.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Flexibility', endpointRight: 'Structure'
	},
	{
		key: 'delegation_comfort',
		question: 'I find it easy to delegate work to others.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Very hard', endpointRight: 'Very easy'
	},
	// Batch 2 (Sessions 3-4): Motivations & stress
	{
		key: 'decision_style',
		question: 'I prioritize logical consistency over impact on people.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'People first', endpointRight: 'Logic first'
	},
	{
		key: 'core_motivation',
		question: 'I\'m driven by a desire for...',
		type: 'enum',
		options: [
			{ value: 'correctness', label: 'Correctness — doing things right' },
			{ value: 'helping', label: 'Helping — making others\' lives better' },
			{ value: 'achievement', label: 'Achievement — accomplishing goals' },
			{ value: 'authenticity', label: 'Authenticity — being true to myself' },
			{ value: 'understanding', label: 'Understanding — knowing how things work' },
			{ value: 'security', label: 'Security — stability and safety' },
			{ value: 'experience', label: 'Experience — variety and stimulation' },
			{ value: 'autonomy', label: 'Autonomy — freedom and independence' },
			{ value: 'peace', label: 'Peace — harmony and balance' }
		]
	},
	{
		key: 'stress_pattern_primary',
		question: 'When overwhelmed, my first response is to...',
		type: 'enum',
		options: [
			{ value: 'withdraw', label: 'Withdraw — pull back and isolate' },
			{ value: 'over_prepare', label: 'Over-prepare — plan obsessively' },
			{ value: 'push_harder', label: 'Push harder — brute force through it' },
			{ value: 'scatter', label: 'Scatter — jump between tasks' },
			{ value: 'become_critical', label: 'Become critical — nitpick everything' }
		]
	},
	{
		key: 'competition_response',
		question: 'Competitive situations make me...',
		type: 'enum',
		options: [
			{ value: 'energized', label: 'Energized — I thrive on competition' },
			{ value: 'neutral', label: 'Neutral — depends on the stakes' },
			{ value: 'uncomfortable', label: 'Uncomfortable — I prefer collaboration' }
		]
	},
	{
		key: 'stimulation_need',
		question: 'I need regular variety in my work to stay engaged.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Not at all', endpointRight: 'Absolutely'
	},
	// Batch 3 (Sessions 4-5): Tolerance & needs
	{
		key: 'ambiguity_tolerance',
		question: 'I\'m comfortable with ambiguity and undefined outcomes.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Very uncomfortable', endpointRight: 'Very comfortable'
	},
	{
		key: 'enablement_tendency',
		question: 'I find helping and supporting others\' projects genuinely fulfilling.',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Not really', endpointRight: 'Absolutely'
	},
	{
		key: 'competence_satisfaction',
		question: 'How confident are you in handling unfamiliar challenges?',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Not confident', endpointRight: 'Very confident'
	},
	{
		key: 'relatedness_satisfaction',
		question: 'How connected do you feel to people who depend on your work?',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Disconnected', endpointRight: 'Deeply connected'
	},
	{
		key: 'physical_fitness_baseline',
		question: 'How would you rate your physical fitness?',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Low', endpointRight: 'High'
	},
	// Batch 4 (Sessions 5-6): Capacity & patterns
	{
		key: 'max_sustained_project_duration',
		question: 'Longest project you\'ve sustained consistent effort on?',
		type: 'enum',
		options: [
			{ value: 'days', label: 'Days' },
			{ value: 'weeks', label: 'Weeks' },
			{ value: 'months', label: 'Months' },
			{ value: 'years', label: 'Years' }
		]
	},
	{
		key: 'focus_session_capacity',
		question: 'How many hours of focused work before quality drops?',
		type: 'enum',
		options: [
			{ value: 'under_1h', label: 'Under 1 hour' },
			{ value: '1_2h', label: '1–2 hours' },
			{ value: '2_3h', label: '2–3 hours' },
			{ value: '3_4h', label: '3–4 hours' },
			{ value: 'over_4h', label: 'Over 4 hours' }
		]
	},
	{
		key: 'recovery_rate',
		question: 'After an intense 90-minute session, how long do you need to recover?',
		type: 'enum',
		options: [
			{ value: '15min', label: '15 minutes' },
			{ value: '30min', label: '30 minutes' },
			{ value: '1h', label: 'About an hour' },
			{ value: 'over_2h', label: 'Over 2 hours' }
		]
	},
	{
		key: 'life_domains_count',
		question: 'How many distinct areas of your life do you actively manage?',
		type: 'enum',
		options: [
			{ value: '2_3', label: '2–3 areas' },
			{ value: '4_5', label: '4–5 areas' },
			{ value: '6_7', label: '6–7 areas' },
			{ value: '8_plus', label: '8 or more' }
		]
	},
	{
		key: 'overcommitment_tendency',
		question: 'How often do you feel like you\'re juggling too many projects?',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Never', endpointRight: 'Constantly'
	},
	// Batch 5 (Sessions 6-7): Preferences & self-knowledge
	{
		key: 'task_switching_preference',
		question: 'Would you rather have 4 different tasks or 1 deep task?',
		type: 'enum',
		options: [
			{ value: 'variety', label: '4 different tasks — I like variety' },
			{ value: 'mix', label: 'A mix of both' },
			{ value: 'focus', label: '1 deep task — I like going deep' }
		]
	},
	{
		key: 'purpose_sensitivity',
		question: 'How important is it that your work feels meaningful?',
		type: 'slider', min: 1, max: 5, default: 3,
		endpointLeft: 'Not important', endpointRight: 'Essential'
	},
	// Batch 6: Free text reflections (future integrations)
	{
		key: 'flow_activities',
		question: 'What activities put you in deep focus most easily?',
		type: 'text',
		optional: true
	},
	{
		key: 'avoidance_pattern',
		question: 'What type of task do you most consistently avoid?',
		type: 'text',
		optional: true
	},
	{
		key: 'natural_gravitation',
		question: 'On a completely free day, what do you do first?',
		type: 'text',
		optional: true
	},
	{
		key: 'current_frustration',
		question: 'What\'s your biggest productivity frustration right now?',
		type: 'text',
		optional: true
	},
	// Batch 7: Optional imports
	{
		key: 'imported_mbti',
		question: 'Do you know your MBTI type? (optional)',
		type: 'text',
		optional: true
	},
	{
		key: 'imported_enneagram',
		question: 'Do you know your Enneagram type? (optional)',
		type: 'text',
		optional: true
	},
	{
		key: 'imported_clifton_top5',
		question: 'CliftonStrengths top 5? (optional, comma-separated)',
		type: 'text',
		optional: true
	},
];

const QUESTIONS_PER_SESSION = 4;

export class AdvancedCalibrationModal extends Modal {
	private plugin: EmraldPlugin;
	private questions: CalibrationQuestion[];
	private allUnanswered: CalibrationQuestion[];
	private answers: Record<string, any> = {};
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

		contentEl.createEl('h2', { text: 'Effort profile — Advanced' });

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

		const form = contentEl.createEl('div', { cls: 'emerald-form' });

		let optionalSeparatorShown = false;
		for (const q of displayQuestions) {
			// Insert separator before the first optional/future-integration question
			if (q.optional && !optionalSeparatorShown) {
				optionalSeparatorShown = true;
				form.createEl('hr', { cls: 'emerald-form-separator' });
				form.createEl('div', {
					cls: 'emerald-form-desc emerald-text-muted',
					text: 'Questions below are for future integrations, answers optional.'
				});
			}
			const group = form.createEl('div', { cls: 'emerald-form-group' });
			group.createEl('label', { text: q.question });

			if (q.type === 'slider') {
				const currentVal = q.default ?? 3;
				const labelRow = group.createEl('div', { cls: 'emerald-form-label-row' });
				const valueEl = labelRow.createEl('span', { cls: 'emerald-slider-value', text: `${currentVal}/5` });

				if (q.endpointLeft || q.endpointRight) {
					const endpoints = group.createEl('div', { cls: 'emerald-slider-endpoints' });
					endpoints.createEl('span', { cls: 'emerald-slider-endpoint-left', text: q.endpointLeft ?? '' });
					endpoints.createEl('span', { cls: 'emerald-slider-endpoint-right', text: q.endpointRight ?? '' });
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
				const btnColumn = group.createEl('div', { cls: 'emerald-onboard-enum-group' });
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
		const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions' });

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
