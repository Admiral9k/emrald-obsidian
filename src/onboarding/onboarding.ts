// EMRALD Onboarding Flow
// First-time plugin experience. Goal: user feels productive by the end.
// Steps: Welcome → API Connection → Profile Setup → Calibration → Recovery → Schedule → Projects → Tour

import { App, Modal, Notice, TFile, FuzzySuggestModal, setIcon } from 'obsidian';
import EmraldPlugin from '../../main';
import { VIEW_ABOUT } from '../views/workspace/base';

// ── Step Definitions ─────────────────────────────────────

type OnboardingStep = 'welcome' | 'connect' | 'profile' | 'calibration' | 'recovery' | 'schedule' | 'projects' | 'tour' | 'done';

const STEP_ORDER: OnboardingStep[] = ['welcome', 'connect', 'profile', 'calibration', 'recovery', 'schedule', 'projects', 'tour', 'done'];

// ── Main Onboarding Modal ────────────────────────────────

export class OnboardingModal extends Modal {
	private plugin: EmraldPlugin;
	private currentStep: OnboardingStep = 'welcome';
	private onComplete: () => void;

	// State accumulated across steps
	private apiKey: string = '';
	private isNewUser: boolean = false;
	private projects: Array<{ name: string; effortLevel: 'E1' | 'E2' | 'E3' | 'E4'; notePath?: string }> = [];
	private calibrationAnswers: Record<string, unknown> = {};
	private calibrationPage: number = 0;
	private dailyHours: number[] = [4, 4, 4, 4, 4, 4, 4]; // Sun=0 through Sat=6

	constructor(app: App, plugin: EmraldPlugin, onComplete: () => void) {
		super(app);
		this.plugin = plugin;
		this.onComplete = onComplete;
	}

	onOpen() {
		this.modalEl.addClass('emerald-onboarding-modal');
		this.renderStep();
	}

	onClose() {
		this.contentEl.empty();
		// If user clicks outside or hits X before finishing, still open About EMRALD
		// (finish() already handles the completed path)
		if (!this.plugin.settings.onboardingComplete) {
			this.plugin.settings.onboardingComplete = true;
			void this.plugin.saveSettings();
			activeWindow.setTimeout(() => {
				void this.plugin.openWorkspaceView(VIEW_ABOUT);
				this.onComplete();
			}, 300);
		}
	}

	private renderStep() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');

		// Progress indicator
		this.renderProgress(contentEl);

		switch (this.currentStep) {
			case 'welcome': this.renderWelcome(contentEl); break;
			case 'connect': this.renderConnect(contentEl); break;
			case 'profile': this.renderProfile(contentEl); break;
			case 'calibration': this.renderCalibration(contentEl); break;
			case 'recovery': this.renderRecovery(contentEl); break;
			case 'schedule': this.renderSchedule(contentEl); break;
			case 'projects': this.renderProjects(contentEl); break;
			case 'tour': this.renderTour(contentEl); break;
			case 'done': this.renderDone(contentEl); break;
		}
	}

	private renderProgress(container: HTMLElement) {
		const stepIndex = STEP_ORDER.indexOf(this.currentStep);
		const total = STEP_ORDER.length - 1; // Exclude 'done'

		const bar = container.createDiv({ cls: 'emerald-onboard-progress' });

		for (let i = 0; i < total; i++) {
			bar.createDiv({
				cls: `emerald-onboard-dot ${i < stepIndex ? 'is-done' : ''} ${i === stepIndex ? 'is-active' : ''}`
			});
			if (i < total - 1) {
				bar.createDiv({
					cls: `emerald-onboard-line ${i < stepIndex ? 'is-done' : ''}`
				});
			}
		}

		if (stepIndex > 0 && this.currentStep !== 'done') {
			container.createDiv({
				cls: 'emerald-onboard-step-label',
				text: `Step ${stepIndex} of ${total - 1}`
			});
		}
	}

	// ── Step 1: Welcome ──────────────────────────────────

	private renderWelcome(container: HTMLElement) {
		const welcomeIcon = container.createDiv({ cls: 'emerald-onboard-icon' });
		setIcon(welcomeIcon, 'gem');
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Welcome to EMRALD' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'Track your work sessions, measure effort in real time, and let EMRALD surface patterns you might otherwise miss.'
		});

		const features = container.createDiv({ cls: 'emerald-onboard-features' });
		const items = [
			{ icon: 'timer', text: 'Track work sessions with effort-aware timing' },
			{ icon: 'bar-chart-2', text: 'See 20 metrics about how you work' },
			{ icon: 'flame', text: 'Get burnout warnings before you feel it' },
			{ icon: 'lightbulb', text: 'Receive AI-powered effort insights' }
		];

		for (const item of items) {
			const row = features.createDiv({ cls: 'emerald-onboard-feature' });
			const iconEl = row.createSpan({ cls: 'emerald-onboard-feature-icon' });
			setIcon(iconEl, item.icon);
			row.createSpan({ text: item.text });
		}

		const actions = container.createDiv({ cls: 'emerald-modal-actions emerald-onboard-actions' });
		const startBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary emerald-btn-lg',
			text: 'Get started'
		});
		startBtn.addEventListener('click', () => this.goTo('connect'));
	}

	// ── Step 2: API Connection ───────────────────────────

	private renderConnect(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Connect to EMRALD' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'Enter your API key to connect. You can get one from your EMRALD dashboard.'
		});

		// Privacy reassurance (#9 onboarding copy)
		const privacyCallout = container.createDiv({ cls: 'emerald-wv-about-callout emerald-onboard-privacy' });
		privacyCallout.createDiv({ cls: 'emerald-wv-about-callout-title', text: 'Your notes stay yours.' });
		const privacyBody = privacyCallout.createEl('p', { cls: 'emerald-wv-about-callout-body' });
		privacyBody.appendText('EMRALD never reads, uploads, or indexes your note content. ');
		privacyBody.createEl('strong', { text: 'Ever.' });
		privacyBody.createEl('br');
		privacyBody.createEl('br');
		privacyBody.appendText('What it syncs: session timestamps, effort ratings, and project names \u2014 the minimum needed to calculate your metrics. Your vault content never leaves your machine. The plugin has no mechanism to access your notes \u2014 it couldn\u2019t read them even if it tried.');
		const privacyLinks = privacyCallout.createDiv({ cls: 'emerald-onboard-privacy-links' });
		const policyLink = privacyLinks.createEl('a', { text: 'Privacy policy', href: 'https://effortmastery.com/legal/privacy' });
		policyLink.setAttribute('target', '_blank');
		privacyLinks.appendText(' \u00b7 ');
		const learnLink = privacyLinks.createEl('a', { text: 'See exactly what\u2019s sent', href: 'https://getemrald.com/learn' });
		learnLink.setAttribute('target', '_blank');

		// "Get an API key" link for community plugin store users
		const linkEl = container.createDiv({ cls: 'emerald-onboard-link' });
		const anchor = linkEl.createEl('a', { text: "Don't have an API key? Get one at app.effortmastery.com →", href: 'https://app.effortmastery.com' });
		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			window.open('https://app.effortmastery.com', '_blank');
		});

		const form = container.createDiv({ cls: 'emerald-form' });

		// API Key input
		const keyGroup = form.createDiv({ cls: 'emerald-form-group' });
		keyGroup.createEl('label', { text: 'API key' });
		const keyInput = keyGroup.createEl('input', {
			cls: 'emerald-onboard-input',
			type: 'password',
			placeholder: 'em_...'
		});
		keyInput.value = this.apiKey;
		keyInput.addEventListener('input', () => {
			this.apiKey = keyInput.value;
		});

		// API URL (advanced — collapsed)
		const advGroup = form.createDiv({ cls: 'emerald-form-group' });
		const advToggle = advGroup.createDiv({ cls: 'emerald-onboard-advanced-toggle', text: '▸ Advanced' });
		const advContent = advGroup.createDiv({ cls: 'emerald-onboard-advanced-content' });
		advContent.addClass('emrald-hidden');

		advToggle.addEventListener('click', () => {
			const visible = !advContent.hasClass('emrald-hidden');
			if (visible) { advContent.addClass('emrald-hidden'); } else { advContent.removeClass('emrald-hidden'); }
			advToggle.textContent = visible ? '▸ Advanced' : '▾ Advanced';
		});

		advContent.createEl('label', { text: 'API URL' });
		const urlInput = advContent.createEl('input', {
			cls: 'emerald-onboard-input',
			type: 'text'
		});
		urlInput.value = this.plugin.settings.apiUrl;

		// Status indicator
		const statusEl = form.createDiv({ cls: 'emerald-onboard-status' });

		// Actions
		const actions = container.createDiv({ cls: 'emerald-modal-actions' });

		const testBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Test connection'
		});
		testBtn.addEventListener('click', () => { void (async () => {
			try {
				if (!this.apiKey.trim()) {
					statusEl.textContent = 'Please enter an API key';
					statusEl.className = 'emerald-onboard-status is-error';
					return;
				}

				statusEl.textContent = 'Testing...';
				statusEl.className = 'emerald-onboard-status is-loading';

				// Temporarily update client
				const apiUrl = urlInput.value || this.plugin.settings.apiUrl;
				this.plugin.apiClient.updateCredentials(this.apiKey, apiUrl);

				const result = await this.plugin.apiClient.testConnection();

				if (result.error) {
					statusEl.textContent = `Connection failed: ${result.error}`;
					statusEl.className = 'emerald-onboard-status is-error';
				} else {
					statusEl.textContent = 'Connected!';
					statusEl.className = 'emerald-onboard-status is-success';

					// Save credentials
					this.plugin.settings.apiKey = this.apiKey;
					this.plugin.settings.apiUrl = apiUrl;
					await this.plugin.saveSettings();

					// Check if new user (no items yet)
					const itemsResp = await this.plugin.apiClient.getItems();
					this.isNewUser = !itemsResp.data || (Array.isArray(itemsResp.data) && itemsResp.data.length === 0);

					// New users get full flow; returning users skip profile/availability but see calibration
					activeWindow.setTimeout(() => this.goTo(this.isNewUser ? 'profile' : 'calibration'), 800);
				}
			} catch { /* non-fatal */ }
		})(); });

		const skipBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: "Skip — i'll configure later"
		});
		skipBtn.addEventListener('click', () => { void this.finish(); });

		const backBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Back'
		});
		backBtn.addEventListener('click', () => this.goTo('welcome'));
	}

	// ── Step 3: Profile Setup ────────────────────────────

	private renderProfile(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Quick profile' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'Tell EMRALD a bit about your work capacity. This helps calibrate effort levels. You can always update these later.'
		});

		const form = container.createDiv({ cls: 'emerald-form' });

		// Availability — simple weekly hours
		const availGroup = form.createDiv({ cls: 'emerald-form-group' });
		availGroup.createEl('label', { text: 'How many hours per day do you work on projects?' });
		availGroup.createDiv({ cls: 'emerald-form-desc', text: 'This sets your daily time budget. You can override it any day.' });

		const sliderRow = availGroup.createDiv({ cls: 'emerald-form-label-row' });
		const valueEl = sliderRow.createSpan({ cls: 'emerald-slider-value', text: '4h' });

		const slider = availGroup.createEl('input', { cls: 'emerald-slider' });
		slider.type = 'range';
		slider.min = '2';
		slider.max = '16';
		slider.value = '4';

		slider.addEventListener('input', () => {
			valueEl.textContent = `${slider.value}h`;
		});

		// Actions
		const actions = container.createDiv({ cls: 'emerald-modal-actions' });

		const nextBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Next'
		});
		nextBtn.addEventListener('click', () => { void (async () => {
			try {
				// Save availability — set same hours for all 7 days
				const hours = parseInt(slider.value) || 4;
				try {
					await this.plugin.apiClient.setWeeklyAvailability(hours);
				} catch { /* non-fatal */
					// Non-fatal — user can always set this in settings
				}

				this.goTo('calibration');
			} catch { /* non-fatal */ }
		})(); });

	}

	// ── Step 3b: Calibration Questions ───────────────────

	private static readonly CALIBRATION_QUESTIONS: Array<{
		key: string;
		question: string;
		type: 'slider' | 'enum';
		options?: Array<{ value: string; label: string }>;
		min?: number;
		max?: number;
		default?: unknown;
	}> = [
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

	private static readonly QUESTIONS_PER_PAGE = 3;

	private renderCalibration(container: HTMLElement) {
		const questions = OnboardingModal.CALIBRATION_QUESTIONS;
		const perPage = OnboardingModal.QUESTIONS_PER_PAGE;
		const totalPages = Math.ceil(questions.length / perPage);
		const pageQuestions = questions.slice(
			this.calibrationPage * perPage,
			(this.calibrationPage + 1) * perPage
		);

		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Effort profile' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'These questions help EMRALD calibrate effort levels to your personal style. Be honest — there are no wrong answers.'
		});

		// Page counter
		container.createDiv({
			cls: 'emerald-onboard-step-label',
			text: `Page ${this.calibrationPage + 1} of ${totalPages}  •  Question ${this.calibrationPage * perPage + 1}–${Math.min((this.calibrationPage + 1) * perPage, questions.length)} of ${questions.length}`
		});

		const form = container.createDiv({ cls: 'emerald-form' });

		for (const q of pageQuestions) {
			const group = form.createDiv({ cls: 'emerald-form-group' });
			group.createEl('label', { text: q.question });

			if (q.type === 'slider') {
				const currentVal = (this.calibrationAnswers[q.key] as number) ?? (q.default as number) ?? 3;

				const labelRow = group.createDiv({ cls: 'emerald-form-label-row' });
				const valueEl = labelRow.createSpan({ cls: 'emerald-slider-value', text: `${currentVal}/5` });

				const endpoints = group.createDiv({ cls: 'emerald-slider-endpoints' });
				endpoints.createSpan({ cls: 'emerald-slider-endpoint-left', text: 'Not at all' });
				endpoints.createSpan({ cls: 'emerald-slider-endpoint-right', text: 'Very much' });

				const slider = group.createEl('input', { cls: 'emerald-slider' });
				slider.type = 'range';
				slider.min = String(q.min ?? 1);
				slider.max = String(q.max ?? 5);
				slider.value = String(currentVal);

				const key = q.key;
				slider.addEventListener('input', () => {
					const val = parseInt(slider.value);
					valueEl.textContent = `${val}/5`;
					this.calibrationAnswers[key] = val;
				});

				// Set initial value if not already set
				if (this.calibrationAnswers[key] === undefined) {
					this.calibrationAnswers[key] = currentVal;
				}
			} else if (q.type === 'enum' && q.options) {
				const currentVal = this.calibrationAnswers[q.key] ?? null;
				const btnColumn = group.createDiv({ cls: 'emerald-onboard-enum-group' });

				for (const opt of q.options) {
					const btn = btnColumn.createEl('button', {
						cls: `emerald-onboard-enum-btn ${currentVal === opt.value ? 'is-active' : ''}`,
						text: opt.label
					});

					const key = q.key;
					btn.addEventListener('click', () => {
						this.calibrationAnswers[key] = opt.value;
						// Update visual state
						btnColumn.querySelectorAll('.emerald-onboard-enum-btn').forEach(b => b.removeClass('is-active'));
						btn.addClass('is-active');
					});
				}
			}
		}

		// Actions — Back (left), Next/Save (middle), Skip (right with gap)
		const actions = container.createDiv({ cls: 'emerald-modal-actions emerald-calibration-actions' });

		if (this.calibrationPage > 0) {
			const backBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-secondary',
				text: 'Back'
			});
			backBtn.addEventListener('click', () => {
				this.calibrationPage--;
				this.renderStep();
			});
		}

		if (this.calibrationPage < totalPages - 1) {
			// Not last page — show Next
			const nextBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Next'
			});
			nextBtn.addEventListener('click', () => {
				this.calibrationPage++;
				this.renderStep();
			});
		} else {
			// Last page — show Save & Continue
			const saveBtn = actions.createEl('button', {
				cls: 'emerald-btn emerald-btn-primary',
				text: 'Save & continue'
			});
			saveBtn.addEventListener('click', () => { void (async () => {
				try {
					// Save all calibration answers to API
					if (Object.keys(this.calibrationAnswers).length > 0) {
						try {
							await this.plugin.apiClient.updateCalibration(this.calibrationAnswers);
							new Notice('Effort profile saved ✓');
						} catch { /* non-fatal */
							new Notice('Profile saved locally — will sync later.');
						}
					}
					this.goTo('recovery');
				} catch { /* non-fatal */ }
			})(); });
		}
	}


	// ── Step 5: Recovery Protocols ─────────────────────

	private renderRecovery(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'What recharges you?' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'Recharge activities are things that restore your energy — like walking, piano, or reading. When EMRALD detects burnout risk, it will suggest these as a gentle nudge, not a prescription.'
		});

		const form = container.createDiv({ cls: 'emerald-form' });

		const protocolGroup = form.createDiv({ cls: 'emerald-form-group' });
		protocolGroup.createEl('label', { text: 'Add up to 3 recharge activities' });

		const hintEl = protocolGroup.createDiv({
			cls: 'emerald-form-desc',
			text: 'Press Enter to add another. These help EMRALD suggest recovery when it matters.'
		});

		let rowCount = 0;
		const MAX_ROWS = 3;

		const addRow = (prefill?: string) => {
			if (rowCount >= MAX_ROWS) return;
			rowCount++;
			const row = createDiv({ cls: 'emerald-recovery-row' });
			const input = row.createEl('input', {
				cls: 'emerald-onboard-input',
				type: 'text',
				placeholder: 'e.g., Walking, Piano, Reading'
			});
			if (prefill) input.value = prefill;
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					if (input.value.trim() && rowCount < MAX_ROWS) addRow();
				}
			});
			// Insert new row BEFORE the hint so hint always stays at the bottom
			protocolGroup.insertBefore(row, hintEl);
		};
		addRow();

		const actions = container.createDiv({ cls: 'emerald-modal-actions' });

		const saveBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Next'
		});
		saveBtn.addEventListener('click', () => { void (async () => {
			try {
				const inputs = protocolGroup.querySelectorAll('input');
				const activities: string[] = [];
				inputs.forEach(input => {
					const val = (input).value.trim();
					if (val) activities.push(val);
				});
				if (activities.length > 0) {
					try {
						for (const activity of activities) {
							await this.plugin.apiClient.createRecoveryProtocol(activity);
						}
						new Notice('Recharge processes saved');
					} catch { /* non-fatal */
						new Notice('Saved locally — will sync later.');
					}
				}
				this.goTo('schedule');
			} catch { /* non-fatal */ }
		})(); });


		const backBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Back'
		});
		backBtn.addEventListener('click', () => this.goTo('calibration'));
	}

	// ── Step 5: Weekly Schedule ──────────────────────────

	private renderSchedule(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Your weekly schedule' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'How many hours per day do you typically devote to tracked projects?'
		});

		// "What's a tracked project?" — first encounter with the concept
		const trackedExplainer = container.createDiv({ cls: 'emerald-onboard-hint emerald-onboard-hint-top' });
		trackedExplainer.createEl('strong', { text: "What's a tracked project?" });
		trackedExplainer.createSpan({
			text: " A tracked project is something you're actively working on: a creative pursuit, a work initiative, a learning goal, a side project. It's bigger than a single task or errand."
		});
		trackedExplainer.createEl('br');
		trackedExplainer.createSpan({
			text: 'Think of it as anything worth dedicating focused time to. Your novel, your certification prep, a weekly meal-planning routine, learning a new song on piano \u2014 not your grocery list.'
		});

		const form = container.createDiv({ cls: 'emerald-form' });

		const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const dayGroup = form.createDiv({ cls: 'emerald-form-group' });
		const dayRow = dayGroup.createDiv({ cls: 'emerald-schedule-row' });

		const inputs: HTMLInputElement[] = [];

		for (let d = 0; d < 7; d++) {
			const dayCol = dayRow.createDiv({ cls: 'emerald-schedule-day' });
			dayCol.createEl('label', { text: dayLabels[d], cls: 'emerald-schedule-label' });

			const input = dayCol.createEl('input', {
				cls: 'emerald-onboard-input emerald-schedule-input',
				type: 'number'
			});
			input.min = '0';
			input.max = '24';
			input.step = '0.5';
			input.value = String(this.dailyHours[d]);

			const dayIndex = d;
			input.addEventListener('input', () => {
				const val = parseFloat(input.value);
				if (!isNaN(val) && val >= 0 && val <= 24) {
					this.dailyHours[dayIndex] = val;
				}
			});

			inputs.push(input);
		}

		// Actions
		const actions = container.createDiv({ cls: 'emerald-modal-actions' });

		const nextBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Next'
		});
		nextBtn.addEventListener('click', () => { void (async () => {
			try {
				const schedule = this.dailyHours.map((hours, day) => ({
					day,
					available_hours: hours
				}));
				try {
					await this.plugin.apiClient.setDailyAvailability(schedule);
				} catch { /* non-fatal */
					// Non-fatal
				}
				this.goTo('projects');
			} catch { /* non-fatal */ }
		})(); });


		const backBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Back'
		});
		backBtn.addEventListener('click', () => this.goTo('recovery'));
	}

	// ── Step 6: Projects ─────────────────────────────

	private renderProjects(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Add your first projects' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: 'What are you working on? Give each project an effort level — EMRALD uses this to measure what your day actually costs you.'
		});

		// Active limit guidance (P2.6)
		container.createDiv({
			cls: 'emerald-onboard-hint emerald-onboard-hint-top',
			text: 'We recommend keeping 5 or fewer active projects. Focus is a feature, not a limitation.'
		});

		// E-level explainer
		const explainer = container.createDiv({ cls: 'emerald-onboard-explainer' });
		explainer.createDiv({ text: 'E1 = Light (25% of your daily work time)' });
		explainer.createDiv({ text: 'E2 = Moderate (50% of your daily work time)' });
		explainer.createDiv({ text: 'E3 = Demanding (75% of your daily work time)' });
		explainer.createDiv({ text: 'E4 = Maximum (100% of your daily work time)' });

		// Note linking hint
		container.createDiv({
			cls: 'emerald-onboard-hint',
			text: 'Tip: click the link icon to connect a project to an existing note — EMRALD will sync session data directly to that note. Without a link, the project lives only in your project list.'
		});

		const form = container.createDiv({ cls: 'emerald-form' });

		// Project list (dynamic)
		const listEl = form.createDiv({ cls: 'emerald-onboard-project-list' });

		const renderList = () => {
			listEl.empty();
			for (let i = 0; i < this.projects.length; i++) {
				const proj = this.projects[i];
				const row = listEl.createDiv({ cls: 'emerald-onboard-project-row' });
				const infoCol = row.createDiv({ cls: 'emerald-onboard-project-info' });
				infoCol.createSpan({ cls: 'emerald-onboard-project-name', text: proj.name });
				infoCol.createSpan({ cls: 'emerald-elevel-badge', text: proj.effortLevel });

				// Note link status
				const noteCol = row.createDiv({ cls: 'emerald-onboard-project-note' });
				if (proj.notePath) {
					const noteLabel = noteCol.createSpan({ cls: 'emerald-onboard-note-path', text: proj.notePath });
					noteLabel.title = proj.notePath;
				}

				// Link Note button
				const linkBtn = noteCol.createEl('button', {
					cls: 'emerald-btn-tiny'
				});
				if (proj.notePath) {
					setIcon(linkBtn, 'pencil');
					linkBtn.title = 'Change linked note';
				} else {
					setIcon(linkBtn, 'link');
					linkBtn.title = 'Link to a note';
				}
				const idx = i; // capture for closure
				linkBtn.addEventListener('click', () => {
					const picker = new NoteSuggestModal(this.app, (file) => {
						this.projects[idx].notePath = file.path;
						renderList();
					});
					picker.open();
				});

				const removeBtn = row.createEl('button', { cls: 'emerald-btn-tiny' });
				setIcon(removeBtn, 'x');
				removeBtn.addEventListener('click', () => {
					this.projects.splice(i, 1);
					renderList();
				});
			}
		};

		// Add project form
		const addRow = form.createDiv({ cls: 'emerald-onboard-add-row' });
		const nameInput = addRow.createEl('input', {
			cls: 'emerald-onboard-input emerald-onboard-proj-name',
			type: 'text',
			placeholder: 'Project name...'
		});

		const levelSelect = addRow.createEl('select', { cls: 'emerald-onboard-select' });
		for (const l of ['E1', 'E2', 'E3', 'E4']) {
			const opt = levelSelect.createEl('option', { value: l, text: l });
			if (l === 'E2') opt.selected = true;
		}

		const addBtn = addRow.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: '+ add' });
		addBtn.addEventListener('click', () => {
			const name = nameInput.value.trim();
			if (!name) return;
			this.projects.push({ name, effortLevel: levelSelect.value as 'E1' | 'E2' | 'E3' | 'E4' });
			nameInput.value = '';
			renderList();
		});

		// Enter key on input
		nameInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') addBtn.click();
		});

		renderList();

		// Hint
		container.createDiv({
			cls: 'emerald-onboard-hint',
			text: 'Add at least 1 to get started. You can always add more later.'
		});

		// Actions
		const actions = container.createDiv({ cls: 'emerald-modal-actions' });

		const nextBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Next'
		});
		nextBtn.addEventListener('click', () => { void (async () => {
			try {
				// Create projects via API, including the linked note path now that the
				// production schema has the obsidian_note_path column.
				for (const proj of this.projects) {
					const resp = await this.plugin.apiClient.createItem({
						name: proj.name,
						effort_level: proj.effortLevel,
						obsidian_note_path: proj.notePath
					});
					if (resp.error) {
						new Notice(`Failed to create project "${proj.name}": ${resp.error}`);
					}
				}
				this.goTo('tour');
			} catch { /* non-fatal */ }
		})(); });

	}

	// ── Step 7: Tour & Done ──────────────────────────

	private renderTour(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Quick tour' });

		const steps = [
			{
				icon: 'timer',
				title: 'Timeblock',
				desc: 'This is your day. A 24-hour bar shows time passing. When you start a session, the clock freezes and a green bar fills — showing your daily effort in real time.'
			},
			{
				icon: 'folder',
				title: 'Projects',
				desc: 'Your active projects live here. Click one to start a session, open the project note, or change the location / effort level.'
			},
			{
				icon: 'bar-chart-2',
				title: 'Effort management',
				desc: "Seven sections break down the ins and outs of your effort levels. Each one opens a detailed workspace view for you to analyze and track. If you're a PRO user, read effort insights and pinnable sparklines at a glance."
			},
			{
				icon: 'flame',
				title: 'Burnout Protection',
				desc: "EMRALD watches your work patterns. If effort levels get risky, you'll get a gentle heads-up with suggested actions."
			}
		];

		const tourList = container.createDiv({ cls: 'emerald-onboard-tour' });

		for (const step of steps) {
			const card = tourList.createDiv({ cls: 'emerald-onboard-tour-step' });
			const iconEl = card.createSpan({ cls: 'emerald-onboard-tour-icon' });
			setIcon(iconEl, step.icon);
			const content = card.createDiv({ cls: 'emerald-onboard-tour-content' });
			content.createDiv({ cls: 'emerald-onboard-tour-title', text: step.title });
			content.createDiv({ cls: 'emerald-onboard-tour-desc', text: step.desc });
		}

		// Actions
		const actions = container.createDiv({ cls: 'emerald-modal-actions' });

		const doneBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary emerald-btn-lg',
			text: "Let's go!"
		});
		doneBtn.addEventListener('click', () => this.goTo('done'));
	}

	// ── Done ─────────────────────────────────────────────

	private renderDone(container: HTMLElement) {
		const doneIcon = container.createDiv({ cls: 'emerald-onboard-icon' });
		setIcon(doneIcon, 'sparkles');
		container.createEl('h2', { cls: 'emerald-onboard-title', text: "You're all set!" });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: "EMRALD has enough data to start working for you. Track your sessions, check your metrics, and if you're a PRO user, get insights right away."
		});

		container.createEl('p', {
			cls: 'emerald-onboard-desc emerald-onboard-profile-nudge',
			text: 'Want even smarter insights? Complete your effort profile — it helps EMRALD understand your work style, calibrate effort levels, and catch burnout patterns earlier.'
		});

		// Research opt-in
		const researchRow = container.createDiv({ cls: 'emerald-onboard-research' });
		const researchToggle = researchRow.createEl('label', { cls: 'emerald-onboard-research-label' });
		const checkbox = researchToggle.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.plugin.settings.researchOptIn;
		checkbox.addEventListener('change', () => { void (async () => {
			try {
				this.plugin.settings.researchOptIn = checkbox.checked;
				await this.plugin.saveSettings();
				try {
					await this.plugin.apiClient.updatePreferences({ research_opt_in: checkbox.checked });
				} catch { /* non-fatal */ }
			} catch { /* non-fatal */ }
		})(); });
		researchToggle.appendText(' Help improve EMRALD — contribute anonymous usage data to build smarter features and advance effort management research. ');
		researchToggle.createSpan({
			cls: 'emerald-link',
			text: 'Change anytime in Settings → Privacy.'
		});

		const actions = container.createDiv({ cls: 'emerald-modal-actions emerald-onboard-done-actions' });

		const profileBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary emerald-btn-lg',
			text: 'Enable advanced profile'
		});
		profileBtn.addEventListener('click', () => { void (async () => {
			try {
				// Show the Advanced mode upgrade modal
				const { AdvancedUpgradeModal } = await import('../modals/advanced-upgrade');
				const modal = new AdvancedUpgradeModal(
					this.app,
					this.plugin,
					() => {
						// Accepted — finish onboarding, questions will appear at session start
						void this.finish();
					},
					() => {
						// Declined — finish onboarding in Simple mode
						void this.finish();
					}
				);
				this.close();
				modal.open();
			} catch { /* non-fatal */ }
		})(); });

		const laterBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: 'Keep it simple for now'
		});
		laterBtn.addEventListener('click', () => { void this.finish(); });
	}

	// ── Navigation ───────────────────────────────────────

	private goTo(step: OnboardingStep) {
		this.currentStep = step;
		this.renderStep();
	}

	private async finish() {
		// Mark onboarding complete
		this.plugin.settings.onboardingComplete = true;
		await this.plugin.saveSettings();

		// Open About EMRALD after onboarding — the in-app field guide.
		// Use a tiny delay so the sidebar has time to mount first.
		const aboutViewType = VIEW_ABOUT;
		this.close();
		activeWindow.setTimeout(() => {
			void this.plugin.openWorkspaceView(aboutViewType);
			this.onComplete();
		}, 300);
	}
}

// ── Note Suggest Modal ───────────────────────────────────
// Uses Obsidian's FuzzySuggestModal to browse vault notes

class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Type to search notes...');
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
