// EMRALD Per-Project Effort Comparison Modal (SEQ-6 Block 1, S105)
//
// Placement source of record: projects/apecs/SEQ-6-COMPARISON-FORECAST-UI-PLAN.md
// Engine source of record:     emrald-api/src/engine/effort-prediction.ts
// Engine audit (trustworthy):  projects/apecs/AUDIT-REPORT-SEQ-ENGINES-S103.md
//
// Purpose: the DISPLAY layer for the per-project predicted-vs-behavioral
// comparison engine. Opened from the Effort Allocations view by clicking a
// project ("judging what I'm doing now" = Track). Read-only.
//
// ⚠️ COMPARE, DON'T FUSE (design §2 — standing engine principle). This modal
// renders `predicted` and `behavioral` as TWO independent panels, never a
// single blended number. When the engine marks a pair `comparable: false`
// (different scales, e.g. expertise-match vs flow-rate), we show the two
// values side by side WITHOUT a delta — the UI must not invent a fusion the
// engine deliberately withheld.

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';
import { ComparisonPair, EffortComparison, TrackedItem } from '../api/client';

const E_LEVEL_COLOR: Record<string, string> = {
	E1: '#2D7A4A',
	E2: '#B8912E',
	E3: '#C06A30',
	E4: '#B54545',
};

export class EffortComparisonModal extends Modal {
	private plugin: EmraldPlugin;
	private item: TrackedItem;

	constructor(app: App, plugin: EmraldPlugin, item: TrackedItem) {
		super(app);
		this.plugin = plugin;
		this.item = item;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-effort-comparison-modal');

		// Header
		contentEl.createEl('h2', { text: 'Effort comparison' });
		const subtitleRow = contentEl.createDiv({ cls: 'emerald-modal-subtitle-row' });
		subtitleRow.createSpan({ cls: 'emerald-modal-subtitle', text: this.item.name });
		subtitleRow.createSpan({
			cls: 'emerald-pill emerald-pill-experimental',
			text: 'Experimental',
		});

		const preamble = contentEl.createDiv({ cls: 'emerald-form-desc emerald-effort-comparison-preamble' });
		preamble.createEl('p', {
			text: 'How your predictions for this project line up against how it actually played out. Each row shows your guess beside the behavioral reality — never blended into one score.',
		});

		const body = contentEl.createDiv({ cls: 'emerald-effort-comparison-body' });
		body.createDiv({ cls: 'emerald-form-note', text: 'Loading comparison…' });

		let resp;
		try {
			resp = await this.plugin.apiClient.getItemComparison(this.item.id);
		} catch {
			body.empty();
			this.renderMessage(body, 'Could not load comparison — check your connection.');
			this.renderCloseAction(contentEl);
			return;
		}

		body.empty();

		if (resp.data === null || resp.data === undefined) {
			if (resp.status === 0 || resp.error) {
				this.renderMessage(body, 'Offline — comparison will load when you reconnect.');
			} else {
				this.renderMessage(body, 'No comparison data available yet.');
			}
			this.renderCloseAction(contentEl);
			return;
		}

		this.renderComparison(body, resp.data);
		this.renderCloseAction(contentEl);
	}

	// ── Render the full comparison object ──────────────────────────

	private renderComparison(container: HTMLElement, cmp: EffortComparison) {
		// Honest cold-start states (engine design §10.2).
		if (cmp.status === 'no_profile') {
			this.renderMessage(
				container,
				'No effort profile captured for this project yet. Add one from the project menu to start comparing your predictions against reality.',
			);
			this.renderBehavioralSummary(container, cmp);
			return;
		}
		if (cmp.status === 'no_behavioral_data') {
			this.renderMessage(
				container,
				'Predictions captured, but no sessions have run on this project yet. Once you log some work, your estimates get compared here.',
			);
			this.renderBehavioralSummary(container, cmp);
			return;
		}

		// ── skill_challenge_ratio (derived flow-zone indicator) ──
		this.renderSkillChallenge(container, cmp);

		// ── CORE comparison pairs ──
		if (cmp.core.length > 0) {
			const section = container.createDiv({ cls: 'emerald-effort-comparison-section' });
			section.createEl('h3', { text: 'Predicted vs actual' });
			for (const pair of cmp.core) {
				this.renderPair(section, pair);
			}
		}

		// ── Behavioral summary footer ──
		this.renderBehavioralSummary(container, cmp);
	}

	// ── One predicted|behavioral pair (two panels, never fused) ────

	private renderPair(container: HTMLElement, pair: ComparisonPair) {
		const card = container.createDiv({ cls: 'emerald-comparison-pair' });

		// Header row: field label + optional B-ref + delta chip (only when comparable)
		const header = card.createDiv({ cls: 'emerald-comparison-pair-header' });
		header.createSpan({ cls: 'emerald-comparison-pair-label', text: this.fieldLabel(pair.field) });
		if (pair.b_ref) {
			header.createSpan({ cls: 'emerald-comparison-pair-bref', text: pair.b_ref });
		}
		if (pair.comparable && pair.delta !== null) {
			const chip = header.createSpan({ cls: 'emerald-comparison-delta-chip' });
			const mag = Math.abs(pair.delta);
			chip.setText(pair.delta === 0 ? 'Match' : `${pair.delta > 0 ? '+' : '−'}${this.fmt(mag)}`);
			chip.addClass(mag < 1 ? 'is-aligned' : mag < 2.5 ? 'is-mild' : 'is-strong');
		} else if (!pair.comparable) {
			// Segmented view — engine deliberately withheld a delta. Say so.
			const chip = header.createSpan({ cls: 'emerald-comparison-delta-chip is-segmented' });
			chip.setText('Side by side');
		}

		// Two panels
		const panels = card.createDiv({ cls: 'emerald-comparison-panels' });

		const predPanel = panels.createDiv({ cls: 'emerald-comparison-panel emerald-comparison-panel-predicted' });
		predPanel.createDiv({ cls: 'emerald-comparison-panel-tag', text: 'Predicted' });
		predPanel.createDiv({ cls: 'emerald-comparison-panel-value', text: pair.predicted !== null ? this.fmt(pair.predicted) : '—' });
		predPanel.createDiv({ cls: 'emerald-comparison-panel-scale', text: pair.predicted_scale });

		const behPanel = panels.createDiv({ cls: 'emerald-comparison-panel emerald-comparison-panel-behavioral' });
		behPanel.createDiv({ cls: 'emerald-comparison-panel-tag', text: 'Actual' });
		behPanel.createDiv({ cls: 'emerald-comparison-panel-value', text: pair.behavioral !== null ? this.fmt(pair.behavioral) : '—' });
		behPanel.createDiv({ cls: 'emerald-comparison-panel-scale', text: pair.behavioral_scale });

		// Plain-language note
		card.createDiv({ cls: 'emerald-comparison-pair-note', text: pair.note });
	}

	// ── skill_challenge_ratio (derived, B1+B2) ─────────────────────

	private renderSkillChallenge(container: HTMLElement, cmp: EffortComparison) {
		const scr = cmp.skill_challenge_ratio;
		const section = container.createDiv({ cls: 'emerald-effort-comparison-section emerald-comparison-scr' });
		section.createEl('h3', { text: 'Flow-zone indicator' });

		if (scr.value === null || scr.zone === null) {
			section.createDiv({ cls: 'emerald-form-note', text: scr.note });
			return;
		}

		const zoneRow = section.createDiv({ cls: 'emerald-comparison-scr-row' });
		const badge = zoneRow.createSpan({ cls: 'emerald-comparison-scr-badge' });
		badge.setText(this.zoneLabel(scr.zone));
		badge.dataset.zone = scr.zone;
		zoneRow.createSpan({ cls: 'emerald-comparison-scr-ratio', text: `skill ÷ challenge = ${this.fmt(scr.value)}` });

		section.createDiv({ cls: 'emerald-comparison-pair-note', text: scr.note });
	}

	// ── Behavioral summary footer ──────────────────────────────────

	private renderBehavioralSummary(container: HTMLElement, cmp: EffortComparison) {
		const bs = cmp.behavioral_summary;
		const section = container.createDiv({ cls: 'emerald-effort-comparison-section emerald-comparison-summary' });
		section.createEl('h3', { text: 'Behavioral record' });

		const chips = section.createDiv({ cls: 'emerald-comparison-summary-chips' });
		this.chip(chips, `${bs.session_count} session${bs.session_count !== 1 ? 's' : ''}`);
		if (bs.total_hours !== null) this.chip(chips, `${this.fmt(bs.total_hours)}h total`);
		if (bs.assigned_e_level) {
			const c = this.chip(chips, `Assigned ${bs.assigned_e_level}`);
			c.style.color = E_LEVEL_COLOR[bs.assigned_e_level] ?? 'var(--text-muted)';
		}
		if (bs.avg_perceived_effort !== null) this.chip(chips, `Avg effort ${this.fmt(bs.avg_perceived_effort)}/10`);
		if (bs.avg_hedonic_valence !== null) this.chip(chips, `Avg valence ${this.fmt(bs.avg_hedonic_valence)}/10`);
		if (bs.flow_rate !== null) this.chip(chips, `Flow ${Math.round(bs.flow_rate * 100)}%`);
	}

	// ── Small helpers ──────────────────────────────────────────────

	private chip(container: HTMLElement, text: string): HTMLElement {
		return container.createSpan({ cls: 'emerald-comparison-summary-chip', text });
	}

	private renderMessage(container: HTMLElement, text: string) {
		container.createDiv({ cls: 'emerald-comparison-message', text });
	}

	private renderCloseAction(contentEl: HTMLElement) {
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });
		const closeBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Close',
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	private fmt(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
	}

	private zoneLabel(zone: string): string {
		switch (zone) {
			case 'flow_zone': return 'Flow zone';
			case 'stretch': return 'Stretch / growth';
			case 'comfort': return 'Comfort zone';
			default: return zone;
		}
	}

	private fieldLabel(field: string): string {
		const labels: Record<string, string> = {
			duration_estimate_hours: 'Time estimate',
			task_complexity_intrinsic: 'Task complexity',
			autotelic_rating: 'Anticipated enjoyment',
			expertise_match: 'Expertise match',
		};
		return labels[field] ?? field.replace(/_/g, ' ');
	}

	onClose() {
		this.contentEl.empty();
	}
}
