// EMRALD Reassessment Modal
// Re-presents calibration questions pre-filled with current answers.
// On save: updates answers via PATCH /profile/questions, then snapshots
// the old profile via POST /profile/reassessment.

import { App, Modal, Notice, setIcon } from 'obsidian';
import EmraldPlugin from '../../main';

// ── Question Definitions ────────────────────────────────
// Mirrors OnboardingModal.CALIBRATION_QUESTIONS exactly.

interface CalibrationQuestion {
	key: string;
	question: string;
	type: 'slider' | 'enum' | 'text';
	options?: Array<{ value: string; label: string }>;
	min?: number;
	max?: number;
	default?: any;
	endpointLeft?: string;
	endpointRight?: string;
	optional?: boolean;
}

const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
	// Page 1: Work style
	{
		key: 'chronotype',
		question: 'When do you do your best, most focused work?',
		type: 'enum',
		options: [
			{ value: 'early_morning', label: 'Early morning (5–8am)' },
			{ value: 'mid_morning', label: 'Mid-morning (8–11am)' },
			{ value: 'afternoon', label: 'Afternoon (12–4pm)' },
			{ value: 'evening', label: 'Evening (5–9pm)' },
			{ value: 'late_night', label: 'Late night (10pm+)' }
		]
	},
	{
		key: 'work_pace_style',
		question: 'Do you prefer to work in intense bursts with breaks, or steady?',
		type: 'enum',
		options: [
			{ value: 'burst', label: 'Intense bursts with breaks' },
			{ value: 'mix', label: 'A mix of both' },
			{ value: 'steady', label: 'Steady and consistent' }
		]
	},
	{
		key: 'social_energy_direction',
		question: 'After a day of socializing, I feel...',
		type: 'enum',
		options: [
			{ value: 'energized', label: 'Energized — people charge me up' },
			{ value: 'neutral', label: 'Neutral — depends on the people' },
			{ value: 'drained', label: 'Drained — I need alone time to recover' }
		]
	},
	// Page 2: Personality traits
	{
		key: 'sleep_quality_baseline',
		question: 'In general, how well do you sleep?',
		type: 'slider', min: 1, max: 5, default: 3
	},
	{
		key: 'conscientiousness',
		question: 'I see myself as someone who is organized and follows through...',
		type: 'slider', min: 1, max: 5, default: 3
	},
	{
		key: 'stress_vulnerability',
		question: 'I get stressed easily and worry about things going wrong.',
		type: 'slider', min: 1, max: 5, default: 3
	},
	{
		key: 'novelty_tolerance',
		question: "I'm energized by trying new things and tackling unfamiliar challenges.",
		type: 'slider', min: 1, max: 5, default: 3
	},
	// Page 3: Work patterns
	{
		key: 'routine_tolerance',
		question: 'I can do routine, repetitive work for long stretches without losing focus.',
		type: 'slider', min: 1, max: 5, default: 3
	},
	{
		key: 'procrastination_tendency',
		question: "How often do you delay starting tasks you've committed to?",
		type: 'slider', min: 1, max: 5, default: 3
	},
	{
		key: 'procrastination_trigger',
		question: "When you procrastinate, it's usually because...",
		type: 'enum',
		options: [
			{ value: 'boring', label: 'The task is boring' },
			{ value: 'uncertain', label: "I'm unsure how to start" },
			{ value: 'fear', label: 'Fear of failure or judgment' },
			{ value: 'tired', label: "I'm just tired" },
			{ value: 'distracted', label: 'I get distracted easily' },
			{ value: 'overwhelmed', label: 'It feels too big' }
		]
	},
	// Page 4: Working genius + autonomy
	{
		key: 'working_genius_primary',
		question: 'Which type of work energizes you MOST?',
		type: 'enum',
		options: [
			{ value: 'wonder', label: 'Wonder — asking big questions, imagining possibilities' },
			{ value: 'invention', label: 'Invention — creating new solutions and ideas' },
			{ value: 'discernment', label: 'Discernment — evaluating and giving feedback' },
			{ value: 'galvanizing', label: 'Galvanizing — rallying people to take action' },
			{ value: 'enablement', label: 'Enablement — helping others succeed' },
			{ value: 'tenacity', label: 'Tenacity — finishing tasks and crossing the line' }
		]
	},
	{
		key: 'working_frustration_primary',
		question: 'Which type of work DRAINS you MOST?',
		type: 'enum',
		options: [
			{ value: 'wonder', label: 'Wonder — thinking abstractly without action' },
			{ value: 'invention', label: 'Invention — having to create from scratch' },
			{ value: 'discernment', label: "Discernment — evaluating others' work" },
			{ value: 'galvanizing', label: 'Galvanizing — motivating and organizing people' },
			{ value: 'enablement', label: "Enablement — supporting others' priorities" },
			{ value: 'tenacity', label: 'Tenacity — grinding through repetitive details' }
		]
	},
	{
		key: 'autonomy_satisfaction',
		question: 'How much control do you feel over your daily choices?',
		type: 'slider', min: 1, max: 5, default: 3
	}
];

const QUESTIONS_PER_PAGE = 3;

// ── Advanced Questions (30 total, Q14–Q43) ──────────────
// Shown after basic questions when user is in advanced mode.

const ADVANCED_QUESTIONS: CalibrationQuestion[] = [
	{ key: 'interest_consistency', question: 'I often set goals but later choose to pursue different ones.', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Never', endpointRight: 'Constantly' },
	{ key: 'achievement_drive', question: 'I maintain effort on long projects even when progress is slow.', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Rarely', endpointRight: 'Always' },
	{ key: 'impulsiveness', question: 'I tend to act on impulse rather than thinking things through.', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Never', endpointRight: 'Very often' },
	{ key: 'structure_preference', question: 'I prefer clear plans and structure over flexible situations.', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Flexibility', endpointRight: 'Structure' },
	{ key: 'delegation_comfort', question: 'I find it easy to delegate work to others.', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Very hard', endpointRight: 'Very easy' },
	{ key: 'decision_style', question: 'I prioritize logical consistency over impact on people.', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'People first', endpointRight: 'Logic first' },
	{ key: 'core_motivation', question: "I'm driven by a desire for...", type: 'enum', options: [
		{ value: 'correctness', label: 'Correctness — doing things right' },
		{ value: 'helping', label: "Helping — making others' lives better" },
		{ value: 'achievement', label: 'Achievement — accomplishing goals' },
		{ value: 'authenticity', label: 'Authenticity — being true to myself' },
		{ value: 'understanding', label: 'Understanding — knowing how things work' },
		{ value: 'security', label: 'Security — stability and safety' },
		{ value: 'experience', label: 'Experience — variety and stimulation' },
		{ value: 'autonomy', label: 'Autonomy — freedom and independence' },
		{ value: 'peace', label: 'Peace — harmony and balance' }
	] },
	{ key: 'stress_pattern_primary', question: 'When overwhelmed, my first response is to...', type: 'enum', options: [
		{ value: 'withdraw', label: 'Withdraw — pull back and isolate' },
		{ value: 'over_prepare', label: 'Over-prepare — plan obsessively' },
		{ value: 'push_harder', label: 'Push harder — brute force through it' },
		{ value: 'scatter', label: 'Scatter — jump between tasks' },
		{ value: 'become_critical', label: 'Become critical — nitpick everything' }
	] },
	{ key: 'competition_response', question: 'Competitive situations make me...', type: 'enum', options: [
		{ value: 'energized', label: 'Energized — I thrive on competition' },
		{ value: 'neutral', label: 'Neutral — depends on the stakes' },
		{ value: 'uncomfortable', label: 'Uncomfortable — I prefer collaboration' }
	] },
	{ key: 'stimulation_need', question: 'I need regular variety in my work to stay engaged.', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Not at all', endpointRight: 'Absolutely' },
	{ key: 'ambiguity_tolerance', question: "I'm comfortable with ambiguity and undefined outcomes.", type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Very uncomfortable', endpointRight: 'Very comfortable' },
	{ key: 'enablement_tendency', question: "I find helping and supporting others' projects genuinely fulfilling.", type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Not really', endpointRight: 'Absolutely' },
	{ key: 'competence_satisfaction', question: 'How confident are you in handling unfamiliar challenges?', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Not confident', endpointRight: 'Very confident' },
	{ key: 'relatedness_satisfaction', question: 'How connected do you feel to people who depend on your work?', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Disconnected', endpointRight: 'Deeply connected' },
	{ key: 'physical_fitness_baseline', question: 'How would you rate your physical fitness?', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Low', endpointRight: 'High' },
	{ key: 'max_sustained_project_duration', question: "Longest project you've sustained consistent effort on?", type: 'enum', options: [
		{ value: 'days', label: 'Days' }, { value: 'weeks', label: 'Weeks' },
		{ value: 'months', label: 'Months' }, { value: 'years', label: 'Years' }
	] },
	{ key: 'focus_session_capacity', question: 'How many hours of focused work before quality drops?', type: 'enum', options: [
		{ value: 'under_1h', label: 'Under 1 hour' }, { value: '1_2h', label: '1–2 hours' },
		{ value: '2_3h', label: '2–3 hours' }, { value: '3_4h', label: '3–4 hours' },
		{ value: 'over_4h', label: 'Over 4 hours' }
	] },
	{ key: 'recovery_rate', question: 'After an intense 90-minute session, how long do you need to recover?', type: 'enum', options: [
		{ value: '15min', label: '15 minutes' }, { value: '30min', label: '30 minutes' },
		{ value: '1h', label: 'About an hour' }, { value: 'over_2h', label: 'Over 2 hours' }
	] },
	{ key: 'life_domains_count', question: 'How many distinct areas of your life do you actively manage?', type: 'enum', options: [
		{ value: '2_3', label: '2–3 areas' }, { value: '4_5', label: '4–5 areas' },
		{ value: '6_7', label: '6–7 areas' }, { value: '8_plus', label: '8 or more' }
	] },
	{ key: 'overcommitment_tendency', question: "How often do you feel like you're juggling too many projects?", type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Never', endpointRight: 'Constantly' },
	{ key: 'task_switching_preference', question: 'Would you rather have 4 different tasks or 1 deep task?', type: 'enum', options: [
		{ value: 'variety', label: '4 different tasks — I like variety' },
		{ value: 'mix', label: 'A mix of both' },
		{ value: 'focus', label: '1 deep task — I like going deep' }
	] },
	{ key: 'purpose_sensitivity', question: 'How important is it that your work feels meaningful?', type: 'slider', min: 1, max: 5, default: 3, endpointLeft: 'Not important', endpointRight: 'Essential' },
	{ key: 'flow_activities', question: 'What activities put you in deep focus most easily?', type: 'text', optional: true },
	{ key: 'avoidance_pattern', question: 'What type of task do you most consistently avoid?', type: 'text', optional: true },
	{ key: 'natural_gravitation', question: 'On a completely free day, what do you do first?', type: 'text', optional: true },
	{ key: 'current_frustration', question: "What's your biggest productivity frustration right now?", type: 'text', optional: true },
	{ key: 'imported_mbti', question: 'Do you know your MBTI type? (optional)', type: 'text', optional: true },
	{ key: 'imported_enneagram', question: 'Do you know your Enneagram type? (optional)', type: 'text', optional: true },
	{ key: 'imported_clifton_top5', question: 'CliftonStrengths top 5? (optional, comma-separated)', type: 'text', optional: true },
];

// ── Core Fields (stored as direct columns) ──────────────
const CORE_FIELDS = [
	'physical_capability', 'mental_capability',
	'mental_abstract_endurance', 'mental_routine_endurance',
	'physical_novel_endurance', 'physical_routine_endurance',
	'motivation_job', 'motivation_family',
	'motivation_personal', 'motivation_social',
];

// ── Reassessment Modal ──────────────────────────────────

export class ReassessmentModal extends Modal {
	private plugin: EmraldPlugin;
	private answers: Record<string, any> = {};
	private originalAnswers: Record<string, any> = {};
	private page: number = 0;
	private loaded: boolean = false;
	private isAdvancedMode: boolean = false;
	private allQuestions: CalibrationQuestion[] = [];

	constructor(app: App, plugin: EmraldPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		this.modalEl.addClass('emerald-onboarding-modal');
		await this.loadCurrentAnswers();
		this.renderPage();
	}

	onClose() {
		this.contentEl.empty();
	}

	// ── Load Current Answers ────────────────────────────

	private async loadCurrentAnswers() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');

		const loadingEl = contentEl.createEl('div', { cls: 'emerald-loading' });
		loadingEl.createEl('div', { cls: 'emerald-spinner' });
		loadingEl.createEl('div', { cls: 'emerald-loading-text', text: 'Loading your current profile...' });

		const resp = await this.plugin.apiClient.getProfile();

		loadingEl.remove();

		if (resp.error || !resp.data) {
			contentEl.createEl('h2', { text: 'Could not load profile' });
			contentEl.createEl('p', {
				cls: 'emerald-modal-subtitle',
				text: resp.error || 'No profile data found. Complete onboarding first.'
			});
			const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions' });
			const closeBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: 'Close' });
			closeBtn.addEventListener('click', () => this.close());
			return;
		}

		// Extract current answers from profile data
		const profile = resp.data as Record<string, any>;
		const advancedAnswers = (profile.advanced_answers || {}) as Record<string, any>;

		// Detect advanced mode
		this.isAdvancedMode = profile.question_mode === 'advanced';

		// Build question list: basic always, advanced if in advanced mode
		this.allQuestions = [...CALIBRATION_QUESTIONS];
		if (this.isAdvancedMode) {
			this.allQuestions = [...this.allQuestions, ...ADVANCED_QUESTIONS];
		}

		// Merge core fields + advanced answers into a flat map
		for (const field of CORE_FIELDS) {
			if (profile[field] != null) {
				this.answers[field] = profile[field];
			}
		}
		for (const [key, value] of Object.entries(advancedAnswers)) {
			this.answers[key] = value;
		}

		// Keep a copy of original answers to detect changes
		this.originalAnswers = { ...this.answers };
		this.loaded = true;
	}

	// ── Render ──────────────────────────────────────────

	private renderPage() {
		if (!this.loaded) return;

		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');

		const totalPages = Math.ceil(this.allQuestions.length / QUESTIONS_PER_PAGE);
		const pageQuestions = this.allQuestions.slice(
			this.page * QUESTIONS_PER_PAGE,
			(this.page + 1) * QUESTIONS_PER_PAGE
		);

		// Detect if we've crossed from basic to advanced section
		const basicCount = CALIBRATION_QUESTIONS.length;
		const pageStart = this.page * QUESTIONS_PER_PAGE;
		const isInAdvancedSection = this.isAdvancedMode && pageStart >= basicCount;

		// Header
		const headerIcon = contentEl.createEl('div', { cls: 'emerald-onboard-icon' });
		setIcon(headerIcon, 'refresh-cw');
		contentEl.createEl('h2', { cls: 'emerald-onboard-title', text: isInAdvancedSection ? 'Reassess — Advanced Profile' : 'Reassess Your Profile' });
		contentEl.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: isInAdvancedSection
				? 'Review your advanced calibration answers. These help EMRALD fine-tune effort predictions.'
				: 'Review and update your answers. Your previous responses are pre-filled — change what feels different now.'
		});

		// Page counter
		contentEl.createEl('div', {
			cls: 'emerald-onboard-step-label',
			text: `Page ${this.page + 1} of ${totalPages}  •  Question ${this.page * QUESTIONS_PER_PAGE + 1}–${Math.min((this.page + 1) * QUESTIONS_PER_PAGE, this.allQuestions.length)} of ${this.allQuestions.length}`
		});

		const form = contentEl.createEl('div', { cls: 'emerald-form' });

		// Show optional separator if first question on this page is optional
		let optionalSeparatorShown = false;

		for (const q of pageQuestions) {
			// Insert separator before the first optional question
			if (q.optional && !optionalSeparatorShown) {
				optionalSeparatorShown = true;
				form.createEl('hr', { cls: 'emerald-form-separator' });
				form.createEl('div', {
					cls: 'emerald-form-desc emerald-text-muted',
					text: 'Questions below are optional — for future integrations.'
				});
			}

			const group = form.createEl('div', { cls: 'emerald-form-group' });
			group.createEl('label', { text: q.question });

			if (q.type === 'slider') {
				const currentVal = this.answers[q.key] ?? q.default ?? 3;

				const labelRow = group.createEl('div', { cls: 'emerald-form-label-row' });
				const valueEl = labelRow.createEl('span', { cls: 'emerald-slider-value', text: `${currentVal}/5` });

				const endpoints = group.createEl('div', { cls: 'emerald-slider-endpoints' });
				endpoints.createEl('span', { cls: 'emerald-slider-endpoint-left', text: q.endpointLeft ?? 'Not at all' });
				endpoints.createEl('span', { cls: 'emerald-slider-endpoint-right', text: q.endpointRight ?? 'Very much' });

				const slider = group.createEl('input', { cls: 'emerald-slider' });
				slider.type = 'range';
				slider.min = String(q.min ?? 1);
				slider.max = String(q.max ?? 5);
				slider.value = String(currentVal);

				const key = q.key;
				slider.addEventListener('input', () => {
					const val = parseInt(slider.value);
					valueEl.textContent = `${val}/5`;
					this.answers[key] = val;
				});

				if (this.answers[key] === undefined) {
					this.answers[key] = currentVal;
				}
			} else if (q.type === 'enum' && q.options) {
				const currentVal = this.answers[q.key] ?? null;
				const btnColumn = group.createEl('div', { cls: 'emerald-onboard-enum-group' });

				for (const opt of q.options) {
					const btn = btnColumn.createEl('button', {
						cls: `emerald-onboard-enum-btn ${currentVal === opt.value ? 'is-active' : ''}`,
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
				const currentVal = this.answers[q.key] ?? '';
				const input = group.createEl('input', {
					cls: 'emerald-onboard-input',
					type: 'text',
					placeholder: 'Type your answer...'
				});
				input.value = currentVal;

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
		const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions emerald-calibration-actions' });

		if (this.page > 0) {
			const backBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-secondary',
				text: 'Back'
			});
			backBtn.addEventListener('click', () => {
				this.page--;
				this.renderPage();
			});
		}

		if (this.page < totalPages - 1) {
			const nextBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Next'
			});
			nextBtn.addEventListener('click', () => {
				this.page++;
				this.renderPage();
			});
		} else {
			// Last page — Save & Reassess
			const saveBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Save & Reassess'
			});
			saveBtn.addEventListener('click', () => this.saveAndReassess());
		}

		// Cancel — always available
		const cancelBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: 'Cancel'
		});
		cancelBtn.addEventListener('click', () => this.close());
	}

	// ── Save & Reassess ─────────────────────────────────

	private async saveAndReassess() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');

		const loadingEl = contentEl.createEl('div', { cls: 'emerald-loading' });
		loadingEl.createEl('div', { cls: 'emerald-spinner' });
		loadingEl.createEl('div', { cls: 'emerald-loading-text', text: 'Saving your updated profile...' });

		try {
			// Only send changed answers
			const changed: Record<string, any> = {};
			for (const [key, value] of Object.entries(this.answers)) {
				if (this.originalAnswers[key] !== value) {
					changed[key] = value;
				}
			}

			// Step 1: Update calibration answers (if any changed)
			if (Object.keys(changed).length > 0) {
				const updateResp = await this.plugin.apiClient.updateCalibration(changed);
				if (updateResp.error) {
					throw new Error(updateResp.error);
				}
			}

			// Step 2: Snapshot old profile + reset reassessment counter
			const reassessResp = await this.plugin.apiClient.triggerReassessment();
			if (reassessResp.error) {
				throw new Error(reassessResp.error);
			}

			loadingEl.remove();

			// Success screen
			const doneIcon = contentEl.createEl('div', { cls: 'emerald-onboard-icon' });
			setIcon(doneIcon, 'check-circle');
			contentEl.createEl('h2', { cls: 'emerald-onboard-title', text: 'Profile Updated!' });

			const changedCount = Object.keys(changed).length;
			const message = changedCount > 0
				? `${changedCount} answer${changedCount > 1 ? 's' : ''} updated. Your previous profile has been saved to history, and EMRALD will recalibrate on the next compute cycle.`
				: 'No answers changed, but your reassessment counter has been reset. EMRALD will check in again after your next 60 days of use.';

			contentEl.createEl('p', { cls: 'emerald-onboard-desc', text: message });

			const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions' });
			const doneBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Done'
			});
			doneBtn.addEventListener('click', () => this.close());

		} catch (err: any) {
			loadingEl.remove();
			contentEl.createEl('h2', { text: 'Something went wrong' });
			contentEl.createEl('p', {
				cls: 'emerald-modal-subtitle',
				text: err.message || 'Failed to update profile. Try again later.'
			});
			const actions = contentEl.createEl('div', { cls: 'emerald-modal-actions' });
			const retryBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: 'Retry' });
			retryBtn.addEventListener('click', () => {
				this.page = Math.ceil(CALIBRATION_QUESTIONS.length / QUESTIONS_PER_PAGE) - 1;
				this.renderPage();
			});
			const closeBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-subtle', text: 'Close' });
			closeBtn.addEventListener('click', () => this.close());
		}
	}
}
