// EMRALD Burnout Warning Modal
// Gentle, "concerned friend" tone. Warm gold visual.
// Max 2 modals per burnout episode. Snooze respected.
// Triggered by D8 crossing threshold.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';
import { createIconEl, ICONS } from '../utils/icons';

export type BurnoutAction = 'take_break' | 'im_okay' | 'snooze' | 'show_data';

export class BurnoutWarningModal extends Modal {
	private plugin: EmraldPlugin;
	private message: string;
	private contributingFactors: string[];
	private burnoutPhase: 'yellow' | 'orange' | 'red';
	/** 'first' = full modal copy. 'followup' = 2nd-of-episode, slightly more direct tone
	 *  (mirrors web BurnoutWatcher.svelte's modalVariant: stored.shown === 0 ? 'first' : 'followup'). */
	private variant: 'first' | 'followup';
	private onAction: (action: BurnoutAction) => void;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		opts: {
			message: string;
			contributingFactors?: string[];
			burnoutPhase?: 'yellow' | 'orange' | 'red';
			variant?: 'first' | 'followup';
		},
		onAction: (action: BurnoutAction) => void
	) {
		super(app);
		this.plugin = plugin;
		this.message = opts.message;
		this.contributingFactors = opts.contributingFactors ?? [];
		this.burnoutPhase = opts.burnoutPhase ?? 'yellow';
		this.variant = opts.variant ?? 'first';
		this.onAction = onAction;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-burnout-modal', `emerald-burnout-${this.burnoutPhase}`);
		contentEl.setAttribute('role', 'alertdialog');
		contentEl.setAttribute('aria-labelledby', 'emerald-burnout-title');
		contentEl.setAttribute('aria-describedby', 'emerald-burnout-desc');

		// Warm gold icon + title
		const header = contentEl.createDiv({ cls: 'emerald-burnout-header' });
		createIconEl(header, ICONS.flame, 'emerald-burnout-icon');
		const titleEl = header.createEl('h2', { text: this.phaseTitle() });
		titleEl.id = 'emerald-burnout-title';

		// Concerned friend message
		const msgEl = contentEl.createEl('p', { cls: 'emerald-burnout-message', text: this.message });
		msgEl.id = 'emerald-burnout-desc';

		// Contributing factors (if any) — only on the first showing of an episode,
		// mirroring web's `variant === 'first' && factors.length > 0` gate.
		if (this.variant === 'first' && this.contributingFactors.length > 0) {
			const factorsEl = contentEl.createDiv({ cls: 'emerald-burnout-factors' });
			factorsEl.createDiv({ cls: 'emerald-burnout-factors-label', text: "What's contributing:" });
			const list = factorsEl.createEl('ul', { cls: 'emerald-burnout-factors-list' });
			for (const factor of this.contributingFactors) {
				list.createEl('li', { text: factor });
			}
		}

		// Gentle suggestion
		const suggestion = contentEl.createDiv({ cls: 'emerald-burnout-suggestion' });
		suggestion.createEl('p', {
			text: this.phaseSuggestion()
		});

		// Action buttons — 3 options per spec
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions emerald-burnout-actions' });

		const breakBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary emerald-btn-warm',
			text: 'Take a break',
			attr: { 'aria-label': 'Take a break' }
		});
		breakBtn.addEventListener('click', () => {
			this.onAction('take_break');
			this.close();
		});

		const okayBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: "I'm okay",
			attr: { 'aria-label': "I'm okay" }
		});
		okayBtn.addEventListener('click', () => {
			this.onAction('im_okay');
			this.close();
		});

		// P2: deep-links to the Burnout Monitor workspace view instead of a plain
		// acknowledge — lets the user see the data behind the warning before deciding.
		const showDataBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: 'Show me the data',
			attr: { 'aria-label': 'Show me the data' }
		});
		showDataBtn.addEventListener('click', () => {
			this.onAction('show_data');
			this.close();
		});

		const snoozeBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-subtle',
			text: 'Snooze for today',
			attr: { 'aria-label': 'Snooze burnout warning for today' }
		});
		snoozeBtn.addEventListener('click', () => {
			this.onAction('snooze');
			this.close();
		});
	}

	private phaseTitle(): string {
		if (this.variant === 'followup') return 'Checking back in';
		switch (this.burnoutPhase) {
			case 'yellow': return 'Hey — just checking in';
			case 'orange': return "You're pushing pretty hard";
			case 'red': return 'You need to stop';
			default: return 'Burnout Warning';
		}
	}

	private phaseSuggestion(): string {
		switch (this.burnoutPhase) {
			case 'yellow':
				return 'Your effort levels have been creeping up. Maybe ease off a bit today?';
			case 'orange':
				return "You've been running hot for a while now. A real break — not just a pause — would do you good.";
			case 'red':
				return "This isn't sustainable. Step away. The work will be there tomorrow, but you need to be too.";
			default:
				return 'Consider taking a break.';
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
