// EMRALD Onboarding Flow
// Signup (about two minutes): Connect (API key) -> Welcome -> First project -> Ready (hours, start the first session).
// The profile questions and "what recharges you" are a separate, optional flow (mode 'questions'), never a gate.
// Strings: ./copy.ts (master deck: LLC-Brain/_wiki/engine/briefs/onboarding-plan-2026-11.md, section 5).
// No counter on the signup screens. The questions flow carries one counter only: "Questions a-b of 13".

import { App, Modal, Notice, TFile, FuzzySuggestModal, setIcon } from 'obsidian';
import EmraldPlugin from '../../main';
import { VIEW_ABOUT } from '../views/workspace/base';
import { COPY, LEVEL_OPTIONS } from './copy';
import { QUESTIONS, PAGE_BOUNDS, progressLine } from './questions';

// ── Step Definitions ─────────────────────────────────────

type OnboardingStep = 'connect' | 'welcome' | 'project' | 'ready' | 'questions' | 'recharge' | 'done';
export type OnboardingMode = 'signup' | 'questions';

/** The API client returns { error } instead of throwing. A queued (offline) write replays later, so it counts as saved. */
function isFailed(resp: { error?: string | null; queued?: boolean } | null | undefined): resp is { error: string; queued?: boolean } {
	return !!resp && !!resp.error && !resp.queued;
}

// ── Main Onboarding Modal ────────────────────────────────

export class OnboardingModal extends Modal {
	private plugin: EmraldPlugin;
	private currentStep: OnboardingStep;
	private mode: OnboardingMode;
	private onComplete: () => void;

	// State accumulated across steps
	private apiKey: string = '';
	private isNewUser: boolean = false;
	private projectName: string = '';
	private projectLevel: string = 'E2';
	private projectNotePath: string | undefined;
	private createdItemId: string | null = null;
	private hours: number = 4;
	private answers: Record<string, string | number> = {};
	private qPage: number = 0;
	private savedSomething: boolean = false;
	private finished: boolean = false;
	private saving: boolean = false;   // the Ready button is mid-save: Esc must not run the close steps
	private isClosed: boolean = false;
	private errorMsg: string = '';     // shown once, on the next render of the questions page

	constructor(app: App, plugin: EmraldPlugin, onComplete: () => void, mode: OnboardingMode = 'signup') {
		super(app);
		this.plugin = plugin;
		this.onComplete = onComplete;
		this.mode = mode;
		this.currentStep = mode === 'questions' ? 'questions' : 'connect';
	}

	onOpen() {
		this.modalEl.addClass('emerald-onboarding-modal');
		this.renderStep();
	}

	onClose() {
		this.isClosed = true;
		this.contentEl.empty();
		// The questions flow never marks onboarding done; it just tells the opener (Effort Profile) to refresh.
		if (this.mode === 'questions') { this.onComplete(); return; }
		// Esc while the Ready button is saving: the save's own ending runs the close steps (success: finish(); failure: failSave()).
		if (this.saving) return;
		this.runCloseSteps();
	}

	/** Closing the signup early still counts as done, so it never nags again. Runs at most once. */
	private runCloseSteps() {
		if (this.finished || this.plugin.settings.onboardingComplete) return;
		this.finished = true;
		this.plugin.settings.onboardingComplete = true;
		void this.plugin.saveSettings();
		window.setTimeout(() => {
			void this.plugin.openWorkspaceView(VIEW_ABOUT);
			this.onComplete();
		}, 300);
	}

	/** The Ready save failed. If the window was already closed with Esc, nothing is left to retry in: do what Esc would have done. */
	private failSave() {
		this.saving = false;
		if (this.isClosed) this.runCloseSteps();
	}

	private renderStep() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal');

		switch (this.currentStep) {
			case 'connect': this.renderConnect(contentEl); break;
			case 'welcome': this.renderWelcome(contentEl); break;
			case 'project': this.renderProject(contentEl); break;
			case 'ready': this.renderReady(contentEl); break;
			case 'questions': this.renderQuestions(contentEl); break;
			case 'recharge': this.renderRecharge(contentEl); break;
			case 'done': this.renderDone(contentEl); break;
		}
	}

	// ── Welcome ──────────────────────────────────────────

	private renderWelcome(container: HTMLElement) {
		const welcomeIcon = container.createDiv({ cls: 'emerald-onboard-icon' });
		setIcon(welcomeIcon, 'gem');
		container.createEl('h2', { cls: 'emerald-onboard-title', text: COPY['welcome.title'] });
		container.createEl('p', { cls: 'emerald-onboard-desc', text: COPY['welcome.body'] });

		const features = container.createDiv({ cls: 'emerald-onboard-features' });
		const items = [
			{ icon: 'timer', text: COPY['welcome.bullets.1'] },
			{ icon: 'clock', text: COPY['welcome.bullets.2'] },
			{ icon: 'lightbulb', text: COPY['welcome.bullets.3'] },
			{ icon: 'flame', text: COPY['welcome.bullets.4'] }
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
			text: COPY['welcome.cta']
		});
		startBtn.addEventListener('click', () => this.goTo('project'));
	}

	// ── Connect (first screen) ───────────────────────────

	private renderConnect(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: 'Connect to EMRALD' });
		container.createEl('p', {
			cls: 'emerald-onboard-desc',
			text: COPY['connect.body']
		});

		// Privacy reassurance (lock icon + single-line callout)
		const privacyEl = container.createDiv({ cls: 'emerald-onboard-privacy' });
		const privacyText = privacyEl.createEl('p', { cls: 'emerald-onboard-privacy-text' });
		const lockIcon = privacyText.createSpan({ cls: 'emerald-onboard-privacy-icon' });
		setIcon(lockIcon, 'lock');
		privacyText.appendText(` ${COPY['connect.privacy']}`);

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
			text: COPY['connect.cta']
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
					this.restoreCredentials();
					statusEl.textContent = `Connection failed: ${result.error}`;
					statusEl.className = 'emerald-onboard-status is-error';
				} else {
					statusEl.textContent = 'Connected!';
					statusEl.className = 'emerald-onboard-status is-success';

					// Save credentials
					this.plugin.setApiKey(this.apiKey);
					this.plugin.settings.apiUrl = apiUrl;
					await this.plugin.saveSettings();

					// Check if new user (no items yet)
					const itemsResp = await this.plugin.apiClient.getItems();
					// Only a SUCCESSFUL empty list is a new account. A failed check must never send a returning user
					// through signup (it would add a duplicate project and overwrite their weekly hours).
					if (itemsResp.error || !Array.isArray(itemsResp.data)) {
						statusEl.textContent = `Connected, but your projects could not be checked: ${itemsResp.error ?? 'no data'}. Press Connect to try again.`;
						statusEl.className = 'emerald-onboard-status is-error';
						return;
					}
					this.isNewUser = itemsResp.data.length === 0;

					// New accounts see Welcome, First project and Ready. An account that already has projects is done.
					window.setTimeout(() => { if (this.isNewUser) this.goTo('welcome'); else void this.finish(false); }, 800);
				}
			} catch { this.restoreCredentials(); }
		})(); });

		const skipBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: COPY['connect.skip']
		});
		skipBtn.addEventListener('click', () => { void this.finish(false); });
	}

	// ── First project (required) ─────────────────────────

	private renderProject(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: COPY['project.title'] });
		container.createEl('p', { cls: 'emerald-onboard-desc', text: COPY['project.body'] });
		container.createDiv({ cls: 'emerald-onboard-hint emerald-onboard-hint-top', text: COPY['project.what'] });

		const explainer = container.createDiv({ cls: 'emerald-onboard-explainer' });
		for (const n of [1, 2, 3, 4]) explainer.createDiv({ text: COPY[`project.legend.${n}`] });

		container.createDiv({ cls: 'emerald-onboard-hint', text: COPY['project.noteLink'] });

		const form = container.createDiv({ cls: 'emerald-form' });
		const addRow = form.createDiv({ cls: 'emerald-onboard-add-row' });
		const nameInput = addRow.createEl('input', {
			cls: 'emerald-onboard-input emerald-onboard-proj-name',
			type: 'text',
			placeholder: 'Project name'
		});
		nameInput.value = this.projectName;
		const levelSelect = addRow.createEl('select', { cls: 'emerald-onboard-select' });
		for (const l of LEVEL_OPTIONS) {
			const opt = levelSelect.createEl('option', { value: l.value, text: l.label });
			if (l.value === this.projectLevel) opt.selected = true;
		}
		levelSelect.addEventListener('change', () => { this.projectLevel = levelSelect.value; });

		// Optional note link
		const linkBtn = addRow.createEl('button', { cls: 'emerald-btn-tiny' });
		const notePathEl = form.createDiv({ cls: 'emerald-onboard-note-path' });
		const showLink = () => {
			linkBtn.empty();
			setIcon(linkBtn, this.projectNotePath ? 'pencil' : 'link');
			linkBtn.title = this.projectNotePath ? 'Change linked note' : 'Link to a note';
			notePathEl.setText(this.projectNotePath ?? '');
		};
		showLink();
		linkBtn.addEventListener('click', () => {
			new NoteSuggestModal(this.app, (file) => { this.projectNotePath = file.path; showLink(); }).open();
		});

		const requiredEl = form.createDiv({ cls: 'emerald-onboard-hint', text: COPY['project.required'] });
		form.createDiv({ cls: 'emerald-form-desc', text: COPY['project.cap'] });

		const actions = container.createDiv({ cls: 'emerald-modal-actions' });
		const nextBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: 'Next' });
		const sync = () => {
			const ok = this.projectName.trim().length > 0;
			nextBtn.disabled = !ok;
			if (ok) requiredEl.addClass('emrald-hidden'); else requiredEl.removeClass('emrald-hidden');
		};
		nameInput.addEventListener('input', () => { this.projectName = nameInput.value; sync(); });
		nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !nextBtn.disabled) nextBtn.click(); });
		sync();
		nextBtn.addEventListener('click', () => { if (this.projectName.trim()) this.goTo('ready'); });

		const backBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: 'Back' });
		backBtn.addEventListener('click', () => this.goTo('welcome'));
	}

	// ── Ready: one hours line, then the first session ────

	private renderReady(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: COPY['ready.title'] });

		const form = container.createDiv({ cls: 'emerald-form' });
		const group = form.createDiv({ cls: 'emerald-form-group' });
		group.createEl('label', { text: COPY['ready.hours'] });
		const hoursInput = group.createEl('input', { cls: 'emerald-onboard-input emerald-onboard-hours', type: 'number' });
		hoursInput.min = '0.5';
		hoursInput.max = '24';
		hoursInput.step = '0.5';
		hoursInput.value = String(this.hours);
		group.createDiv({ cls: 'emerald-form-desc', text: COPY['ready.hours.hint'] });
		form.createDiv({ cls: 'emerald-form-desc', text: COPY['ready.short'] });
		const statusEl = form.createDiv({ cls: 'emerald-onboard-status' });

		const actions = container.createDiv({ cls: 'emerald-modal-actions' });
		const startBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary emerald-btn-lg', text: COPY['ready.cta'] });
		const sync = () => {
			const h = parseFloat(hoursInput.value);
			this.hours = h;
			startBtn.disabled = !(Number.isFinite(h) && h > 0 && h <= 24);
		};
		hoursInput.addEventListener('input', sync);
		sync();

		startBtn.addEventListener('click', () => { void (async () => {
			if (startBtn.disabled) return;
			startBtn.disabled = true;
			this.saving = true;
			statusEl.textContent = '';
			try {
				// Project, hours and the first session are saved together, once, on this button.
				if (!this.createdItemId) {
					const resp = await this.plugin.apiClient.createItem({
						name: this.projectName.trim(),
						effort_level: this.projectLevel,
						obsidian_note_path: this.projectNotePath
					});
					if (resp.error || !resp.data) {
						statusEl.textContent = `Could not create the project: ${resp.error ?? 'try again'}`;
						statusEl.className = 'emerald-onboard-status is-error';
						startBtn.disabled = false;
						this.failSave();
						return;
					}
					this.createdItemId = resp.data.id;
				}
				const hoursResp = await this.plugin.apiClient.setWeeklyAvailability(this.hours);
				if (isFailed(hoursResp)) {
					statusEl.textContent = `Could not save your hours: ${hoursResp.error}. Try again.`;
					statusEl.className = 'emerald-onboard-status is-error';
					startBtn.disabled = false;
					this.failSave();
					return;
				}
				// The sidebar starts this project's session as soon as it has loaded (see sidebar.consumeFirstSession).
				(this.plugin as unknown as Record<string, unknown>)._firstSessionItemId = this.createdItemId;
				await this.finish(true);
			} catch {
				statusEl.textContent = 'Something went wrong. Try again.';
				statusEl.className = 'emerald-onboard-status is-error';
				startBtn.disabled = false;
				this.failSave();
			}
		})(); });

		const backBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: 'Back' });
		backBtn.addEventListener('click', () => this.goTo('project'));
	}

	// ── Questions flow (optional): 13 questions, then what recharges you ──

	private renderQuestions(container: HTMLElement) {
		const [from, to] = PAGE_BOUNDS[this.qPage];
		container.createEl('h2', { cls: 'emerald-onboard-title', text: COPY['questions.title'] });
		container.createEl('p', { cls: 'emerald-onboard-desc', text: COPY['questions.body'] });
		container.createDiv({ cls: 'emerald-onboard-step-label', text: progressLine(COPY['questions.progress'], this.qPage) });
		if (this.errorMsg) {
			container.createDiv({ cls: 'emerald-onboard-status is-error', text: this.errorMsg });
			this.errorMsg = '';
		}

		const form = container.createDiv({ cls: 'emerald-form' });
		for (const q of QUESTIONS.slice(from, to)) {
			const group = form.createDiv({ cls: 'emerald-form-group' });
			group.createEl('label', { text: q.question });
			const key = q.key;

			if (q.type === 'scale') {
				// Five buttons, nothing selected until the user picks; tapping the chosen one again clears it.
				const row = group.createDiv({ cls: 'emerald-btn-group emerald-scale-row' });
				row.setAttribute('role', 'radiogroup');
				row.setAttribute('aria-label', q.question);
				for (let v = 1; v <= 5; v++) {
					const btn = row.createEl('button', { cls: 'emerald-btn-toggle emerald-scale-btn', text: String(v) });
					btn.setAttribute('role', 'radio');
					const paint = () => {
						const on = this.answers[key] === v;
						btn.setAttribute('aria-checked', String(on));
						if (on) btn.addClass('is-active'); else btn.removeClass('is-active');
					};
					paint();
					btn.addEventListener('click', () => {
						if (this.answers[key] === v) delete this.answers[key]; else this.answers[key] = v;
						row.querySelectorAll('.emerald-scale-btn').forEach((b) => { b.removeClass('is-active'); b.setAttribute('aria-checked', 'false'); });
						paint();
					});
				}
				const ends = group.createDiv({ cls: 'emerald-slider-endpoints' });
				ends.createSpan({ cls: 'emerald-slider-endpoint-left', text: q.low ?? 'Low' });
				ends.createSpan({ cls: 'emerald-slider-endpoint-right', text: q.high ?? 'High' });
			} else if (q.options) {
				const col = group.createDiv({ cls: 'emerald-onboard-enum-group' });
				for (const opt of q.options) {
					const btn = col.createEl('button', {
						cls: `emerald-onboard-enum-btn ${this.answers[key] === opt.value ? 'is-active' : ''}`
					});
					btn.setAttribute('aria-pressed', String(this.answers[key] === opt.value));
					if (opt.desc) {
						btn.createSpan({ cls: 'emerald-opt-label', text: opt.label });
						btn.createSpan({ cls: 'emerald-opt-desc', text: opt.desc });
					} else {
						btn.setText(opt.label);
					}
					btn.addEventListener('click', () => {
						if (this.answers[key] === opt.value) delete this.answers[key]; else this.answers[key] = opt.value;
						col.querySelectorAll('.emerald-onboard-enum-btn').forEach((b) => { b.removeClass('is-active'); b.setAttribute('aria-pressed', 'false'); });
						if (this.answers[key] === opt.value) { btn.addClass('is-active'); btn.setAttribute('aria-pressed', 'true'); }
					});
				}
			}
		}

		const actions = container.createDiv({ cls: 'emerald-modal-actions emerald-calibration-actions' });
		if (this.qPage > 0) {
			const backBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: 'Back' });
			backBtn.addEventListener('click', () => { this.qPage--; this.renderStep(); });
		}
		const nextBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: 'Next' });
		nextBtn.addEventListener('click', () => {
			if (this.qPage < PAGE_BOUNDS.length - 1) { this.qPage++; this.renderStep(); }
			else void this.leaveQuestions();
		});
		// Skip for now never saves: it is the way out when a save keeps failing.
		const skipBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-subtle', text: COPY['questions.skip'] });
		skipBtn.addEventListener('click', () => { this.errorMsg = ''; this.goTo('recharge'); });
	}

	/** Save only what was answered (a blank is never written), then move on to the recharge step. */
	private async leaveQuestions() {
		if (Object.keys(this.answers).length > 0) {
			// The API client returns { error } instead of throwing; a queued (offline) write counts as saved.
			let resp: { error?: string | null; queued?: boolean } | undefined;
			try { resp = await this.plugin.apiClient.updateCalibration(this.answers); } catch (e) { resp = { error: String(e) }; }
			if (isFailed(resp)) {
				this.errorMsg = `Could not save your answers: ${resp?.error}. Try again, or press Skip for now to move on without saving them.`;
				this.renderStep(); // stay on this page; the answers are still held
				return;
			}
			this.savedSomething = true;
		}
		this.goTo('recharge');
	}

	private renderRecharge(container: HTMLElement) {
		container.createEl('h2', { cls: 'emerald-onboard-title', text: COPY['recharge.title'] });
		container.createEl('p', { cls: 'emerald-onboard-desc', text: COPY['recharge.body'] });

		const form = container.createDiv({ cls: 'emerald-form' });
		const protocolGroup = form.createDiv({ cls: 'emerald-form-group' });
		protocolGroup.createEl('label', { text: COPY['recharge.label'] });
		const hintEl = protocolGroup.createDiv({ cls: 'emerald-form-desc', text: COPY['recharge.hint'] });

		let rowCount = 0;
		const MAX_ROWS = 3;
		const addRow = () => {
			if (rowCount >= MAX_ROWS) return;
			rowCount++;
			const row = createDiv({ cls: 'emerald-recovery-row' });
			const input = row.createEl('input', {
				cls: 'emerald-onboard-input',
				type: 'text',
				placeholder: 'e.g., Walking, Piano, Reading'
			});
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					if (input.value.trim() && rowCount < MAX_ROWS) addRow();
				}
			});
			protocolGroup.insertBefore(row, hintEl);
		};
		addRow();

		const actions = container.createDiv({ cls: 'emerald-modal-actions' });
		const saveBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary', text: 'Next' });
		const statusEl = form.createDiv({ cls: 'emerald-onboard-status' });
		saveBtn.addEventListener('click', () => { void (async () => {
			const inputs: HTMLInputElement[] = [];
			protocolGroup.querySelectorAll('input').forEach((input) => { if (input.value.trim()) inputs.push(input); });
			saveBtn.disabled = true;
			statusEl.textContent = '';
			for (const input of inputs) {
				let resp: { error?: string | null; queued?: boolean } | undefined;
				try { resp = await this.plugin.apiClient.createRecoveryProtocol(input.value.trim()); } catch (e) { resp = { error: String(e) }; }
				if (isFailed(resp)) {
					// Stay here with what is left typed in; the ones that saved are cleared so a retry never doubles them.
					statusEl.textContent = `Could not save that: ${resp?.error}. Try again, or press Skip.`;
					statusEl.className = 'emerald-onboard-status is-error';
					saveBtn.disabled = false;
					return;
				}
				input.value = '';
				this.savedSomething = true;
			}
			this.afterRecharge();
		})(); });

		const skipBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-subtle', text: COPY['recharge.skip'] });
		skipBtn.addEventListener('click', () => this.afterRecharge());

		const backBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-secondary', text: 'Back' });
		backBtn.addEventListener('click', () => this.goTo('questions'));
	}

	private afterRecharge() {
		if (this.savedSomething) this.goTo('done');
		else this.close();
	}

	private renderDone(container: HTMLElement) {
		const doneIcon = container.createDiv({ cls: 'emerald-onboard-icon' });
		setIcon(doneIcon, 'sparkles');
		container.createEl('p', { cls: 'emerald-onboard-desc', text: COPY['card.done'] });

		// Anonymous usage data opt-in. Starts from the saved choice (unchecked for anyone who never opted in).
		const researchRow = container.createDiv({ cls: 'emerald-onboard-research' });
		const researchToggle = researchRow.createEl('label', { cls: 'emerald-onboard-research-label' });
		const checkbox = researchToggle.createEl('input', { type: 'checkbox' });
		checkbox.checked = !!this.plugin.settings.researchOptIn;
		checkbox.addEventListener('change', () => { void (async () => {
			const wanted = checkbox.checked;
			let resp: { error?: string | null; queued?: boolean } | undefined;
			try { resp = await this.plugin.apiClient.updatePreferences({ research_opt_in: wanted }); } catch (e) { resp = { error: String(e) }; }
			if (isFailed(resp)) {
				checkbox.checked = !wanted; // show what is actually saved
				new Notice(`Could not save that choice: ${resp?.error}. Try again.`);
				return;
			}
			this.plugin.settings.researchOptIn = wanted;
			await this.plugin.saveSettings();
		})(); });
		researchToggle.appendText(` ${COPY['optin.line']}`);

		const actions = container.createDiv({ cls: 'emerald-modal-actions emerald-onboard-done-actions' });
		const doneBtn = actions.createEl('button', { cls: 'emerald-btn emerald-btn-primary emerald-btn-lg', text: 'Done' });
		doneBtn.addEventListener('click', () => this.close());
	}

/** A failed connection test must not leave the typed key live in place of the saved one. */
	private restoreCredentials() {
		this.plugin.apiClient.updateCredentials(this.plugin.getApiKey(), this.plugin.settings.apiUrl);
	}

	// ── Navigation ───────────────────────────────────────

	private goTo(step: OnboardingStep) {
		this.currentStep = step;
		this.renderStep();
	}

	/** Mark the signup done. startedSession = the Ready button was pressed (the sidebar starts the session); About opens only when the user skipped. */
	private async finish(startedSession: boolean) {
		this.finished = true;
		this.plugin.settings.onboardingComplete = true;
		await this.plugin.saveSettings();
		if (!this.isClosed) this.close();
		window.setTimeout(() => {
			if (!startedSession) void this.plugin.openWorkspaceView(VIEW_ABOUT);
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
		// Enumeration is required: this is a user-driven note picker, so it must
		// list the vault's markdown files for the user to choose from.
		return this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
