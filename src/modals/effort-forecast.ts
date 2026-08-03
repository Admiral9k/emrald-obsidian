// EMRALD Per-Project Effort Forecast Modal (SEQ-6 Block 2, S106)
//
// Placement source of record: projects/apecs/SEQ-6-COMPARISON-FORECAST-UI-PLAN.md
// Engine source of record:     emrald-api/src/engine/effort-forecast.ts
// Engine audit (reachable):    projects/apecs/AUDIT-REPORT-SEQ-ENGINES-S103.md (Finding 1 FIXED)
//
// Purpose: the DISPLAY layer for the anchor-then-neighbor effort-forecast engine.
// Opened from the active-project detail (LH column of the sidebar's Projects
// section) — "judging what I'm about to begin" = decision support for a readied
// project. Read-only.
//
// ⚠️ HINT, NEVER PRE-FILL (design §10.1 — hard principle). This modal renders the
// engine's suggestions as READ-ONLY hints beside the fields they refer to. It
// never writes, never auto-populates a slider or E-level. Being a pure readout,
// the pre-fill failure mode is structurally impossible here — the user's own
// effort-profile values are captured elsewhere (the effort-profile modal), and
// this surface only reflects what similar past projects averaged.
//
// ANCHOR SOURCING: the anchors (B1 complexity, B2 expertise-match) + the single
// area-label id are read from the project's CURRENT saved effort profile at open
// time — the freshest details for a readied-active project, NOT a capture-time
// snapshot (Devon's S100 call). Area feeds the coarse fallback grouping.

import { App, Modal, setIcon } from 'obsidian';
import EmraldPlugin from '../../main';
import { EffortForecast, ForecastFieldHint, ItemEffortProfile, TrackedItem } from '../api/client';

const E_LEVEL_COLOR: Record<string, string> = {
	E1: '#2D7A4A',
	E2: '#B8912E',
	E3: '#C06A30',
	E4: '#B54545',
};

export class EffortForecastModal extends Modal {
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
		contentEl.addClass('emerald-modal', 'emerald-effort-forecast-modal');

		// Header
		const titleRow = contentEl.createDiv({ cls: 'emerald-modal-title-row' });
		const titleIcon = titleRow.createSpan({ cls: 'emerald-modal-title-icon' });
		setIcon(titleIcon, 'trending-up');
		titleRow.createEl('h2', { text: 'Effort forecast' });
		titleRow.createSpan({
			cls: 'emerald-pill emerald-pill-experimental',
			text: 'Experimental',
		});

		const subtitleRow = contentEl.createDiv({ cls: 'emerald-modal-subtitle-row' });
		subtitleRow.createSpan({ cls: 'emerald-modal-subtitle', text: this.item.name });

		const preamble = contentEl.createDiv({ cls: 'emerald-form-desc emerald-effort-forecast-preamble' });
		preamble.createEl('p', {
			text: 'What your own past projects with a similar complexity and expertise-match tended to run. These are hints to sanity-check your own read — never enter them for you. Set your own honest values in the effort profile.',
		});

		const body = contentEl.createDiv({ cls: 'emerald-effort-forecast-body' });
		body.createDiv({ cls: 'emerald-form-note', text: 'Loading forecast…' });

		// Read anchors from the project's CURRENT saved effort profile (freshest details).
		let profile: ItemEffortProfile | null;
		try {
			const profResp = await this.plugin.apiClient.getEffortProfile(this.item.id);
			profile = profResp.data ?? null;
		} catch {
			body.empty();
			this.renderMessage(body, 'Could not read this project’s effort profile — check your connection.');
			this.renderCloseAction(contentEl);
			return;
		}

		const complexity = this.numOrNull(profile?.task_complexity_intrinsic);
		const expertise = this.numOrNull(profile?.expertise_match);
		const areaId = this.areaLabelId(this.item);

		// No anchors captured yet → honest guidance, don't hit the engine with a blank form.
		if (complexity === null && expertise === null) {
			body.empty();
			this.renderMessage(
				body,
				'Add this project’s effort profile first — set at least Task complexity or Expertise match. Forecasts are based on your own past projects in a similar band.',
			);
			this.renderCloseAction(contentEl);
			return;
		}

		let resp;
		try {
			resp = await this.plugin.apiClient.getEffortForecast({
				complexity,
				expertise_match: expertise,
				area: areaId,
			});
		} catch {
			body.empty();
			this.renderMessage(body, 'Could not load forecast — check your connection.');
			this.renderCloseAction(contentEl);
			return;
		}

		body.empty();

		if (resp.data === null || resp.data === undefined) {
			if (resp.status === 0 || resp.error) {
				this.renderMessage(body, 'Offline — the forecast will load when you reconnect.');
			} else {
				this.renderMessage(body, 'No forecast available yet.');
			}
			this.renderCloseAction(contentEl);
			return;
		}

		this.renderForecast(body, resp.data, complexity, expertise);
		this.renderCloseAction(contentEl);
	}

	// ── Render the full forecast object ────────────────────────────

	private renderForecast(container: HTMLElement, fc: EffortForecast, complexity: number | null, expertise: number | null) {
		// Anchor echo — remind the user what the forecast is keyed on.
		const anchors = container.createDiv({ cls: 'emerald-forecast-anchors' });
		anchors.createSpan({ cls: 'emerald-forecast-anchors-label', text: 'Based on your read of' });
		const anchorChips = anchors.createDiv({ cls: 'emerald-forecast-anchor-chips' });
		if (complexity !== null) this.chip(anchorChips, `Complexity ${this.fmt(complexity)}/10`);
		if (expertise !== null) this.chip(anchorChips, `Expertise ${this.fmt(expertise)}/10`);

		// Honest cold-start / need-anchors states (engine design §10.2).
		if (fc.status === 'need_anchors' || fc.status === 'cold_start') {
			this.renderMessage(container, fc.message);
			return;
		}

		// Coarse-fallback banner — be transparent that this is a thin estimate.
		if (fc.status === 'coarse_fallback') {
			const banner = container.createDiv({ cls: 'emerald-forecast-fallback-banner' });
			const bIcon = banner.createSpan({ cls: 'emerald-forecast-fallback-icon' });
			setIcon(bIcon, 'info');
			banner.createSpan({ text: this.matchModeLabel(fc.match_mode) });
		}

		// ── Suggested E-level (hint) ──
		if (fc.suggested_e_level) {
			const section = container.createDiv({ cls: 'emerald-effort-forecast-section emerald-forecast-elevel' });
			section.createEl('h3', { text: 'Suggested effort level' });
			const row = section.createDiv({ cls: 'emerald-forecast-elevel-row' });
			const badge = row.createSpan({ cls: 'emerald-forecast-elevel-badge', text: fc.suggested_e_level });
			badge.style.color = E_LEVEL_COLOR[fc.suggested_e_level] ?? 'var(--text-muted)';
			badge.style.borderColor = E_LEVEL_COLOR[fc.suggested_e_level] ?? 'var(--background-modifier-border)';
			if (fc.e_level_confidence) {
				row.createSpan({ cls: 'emerald-forecast-confidence', text: `${fc.e_level_confidence} confidence` });
			}
			section.createDiv({
				cls: 'emerald-forecast-hint-note',
				text: 'A hint from your history — set your own E-level in the project menu.',
			});
		}

		// ── Field hints ──
		if (fc.hints.length > 0) {
			const section = container.createDiv({ cls: 'emerald-effort-forecast-section' });
			section.createEl('h3', { text: 'Your similar projects averaged' });
			for (const hint of fc.hints) {
				this.renderHint(section, hint);
			}
		}

		// ── Framing message ──
		container.createDiv({ cls: 'emerald-forecast-message-footer', text: fc.message });
	}

	// ── One field hint row ─────────────────────────────────────────

	private renderHint(container: HTMLElement, hint: ForecastFieldHint) {
		const row = container.createDiv({ cls: 'emerald-forecast-hint' });

		const header = row.createDiv({ cls: 'emerald-forecast-hint-header' });
		header.createSpan({ cls: 'emerald-forecast-hint-label', text: this.fieldLabel(hint.field) });
		if (hint.b_ref) {
			header.createSpan({ cls: 'emerald-forecast-hint-bref', text: hint.b_ref });
		}
		const val = header.createSpan({ cls: 'emerald-forecast-hint-value' });
		val.setText(`${this.fmt(hint.hint_value)}/10`);

		const meta = row.createDiv({ cls: 'emerald-forecast-hint-meta' });
		meta.setText(`based on ${hint.based_on} project${hint.based_on !== 1 ? 's' : ''}`);
	}

	// ── Small helpers ──────────────────────────────────────────────

	private chip(container: HTMLElement, text: string): HTMLElement {
		return container.createSpan({ cls: 'emerald-forecast-chip', text });
	}

	private renderMessage(container: HTMLElement, text: string) {
		container.createDiv({ cls: 'emerald-forecast-message', text });
	}

	private renderCloseAction(contentEl: HTMLElement) {
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });
		const closeBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Close',
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	private numOrNull(raw: unknown): number | null {
		if (raw === null || raw === undefined) return null;
		const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
		return Number.isFinite(n) ? n : null;
	}

	// The project's single area = its first attached label (Option B, S100).
	private areaLabelId(item: TrackedItem): string | null {
		const labels = item.labels;
		if (Array.isArray(labels) && labels.length > 0) return labels[0].id ?? null;
		return null;
	}

	private fmt(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
	}

	private matchModeLabel(mode: EffortForecast['match_mode']): string {
		switch (mode) {
			case 'area': return 'Few close matches on complexity/expertise — drawing on your past projects in the same area.';
			case 'e_level_band': return 'Few close matches — this is a coarse estimate from projects in a similar effort band.';
			default: return 'Coarse estimate — limited comparable history.';
		}
	}

	private fieldLabel(field: string): string {
		const labels: Record<string, string> = {
			task_clarity: 'Task clarity',
			task_first_step_obvious: 'First step obvious',
			learning_investment: 'Learning investment',
			repetition_impact: 'Repetition impact',
			task_novelty: 'Task novelty',
			autonomy_level: 'Autonomy',
			purpose_alignment: 'Purpose alignment',
			autotelic_rating: 'Anticipated enjoyment',
		};
		return labels[field] ?? field.replace(/_/g, ' ');
	}

	onClose() {
		this.contentEl.empty();
	}
}
