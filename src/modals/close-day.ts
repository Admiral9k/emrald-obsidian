// EMRALD Close Day Modal
// Confirmation before closing the work day.
// Shows: planned vs worked, delta, session count, project breakdown.
// "This can't be undone for today."

import { App, Modal } from 'obsidian';
import EmraldPlugin from '../../main';

export interface CloseDaySummary {
	plannedHours: number;
	workedMinutes: number;
	sessionCount: number;
	projectBreakdown: Array<{ name: string; minutes: number; sessions: number }>;
}

export class CloseDayModal extends Modal {
	private plugin: EmraldPlugin;
	private summary: CloseDaySummary;
	private onConfirm: () => void;

	constructor(
		app: App,
		plugin: EmraldPlugin,
		summary: CloseDaySummary,
		onConfirm: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.summary = summary;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		const { summary } = this;
		contentEl.empty();
		contentEl.addClass('emerald-modal', 'emerald-closeday-modal');

		contentEl.createEl('h2', { text: 'Close your work day?' });

		// Summary stats
		const statsEl = contentEl.createDiv({ cls: 'emerald-closeday-stats' });

		const workedHours = summary.workedMinutes / 60;
		const deltaMinutes = summary.workedMinutes - (summary.plannedHours * 60);
		const deltaAbs = Math.abs(deltaMinutes);
		const deltaHours = Math.floor(deltaAbs / 60);
		const deltaMins = Math.round(deltaAbs % 60);
		const deltaStr = deltaHours > 0 ? `${deltaHours}h ${deltaMins}m` : `${deltaMins}m`;
		const deltaLabel = deltaMinutes >= 0 ? `+${deltaStr} (overtime)` : `-${deltaStr} (finished early)`;

		this.renderStatRow(statsEl, 'Planned', `${summary.plannedHours}h`);
		this.renderStatRow(statsEl, 'Worked', this.formatDuration(summary.workedMinutes));
		this.renderStatRow(statsEl, 'Delta', deltaLabel, deltaMinutes > 0 ? 'emerald-closeday-overtime' : 'emerald-closeday-early');

		// Session count + project count
		const projectCount = summary.projectBreakdown.length;
		statsEl.createDiv({ cls: 'emerald-closeday-sessions' }).createSpan({
			text: `${summary.sessionCount} session${summary.sessionCount !== 1 ? 's' : ''} across ${projectCount} project${projectCount !== 1 ? 's' : ''}`
		});

		// Project breakdown
		if (summary.projectBreakdown.length > 0) {
			const breakdownEl = contentEl.createDiv({ cls: 'emerald-closeday-breakdown' });
			breakdownEl.createDiv({ cls: 'emerald-closeday-breakdown-label', text: 'Breakdown' });

			for (const proj of summary.projectBreakdown) {
				const row = breakdownEl.createDiv({ cls: 'emerald-closeday-proj-row' });
				row.createSpan({ cls: 'emerald-closeday-proj-name', text: proj.name });
				row.createSpan({ cls: 'emerald-closeday-proj-time', text: `${this.formatDuration(proj.minutes)} (${proj.sessions}×)` });
			}
		}

		// Warning
		contentEl.createDiv({ cls: 'emerald-closeday-warning' }).createSpan({
			text: "This can't be undone for today."
		});

		// Actions
		const actions = contentEl.createDiv({ cls: 'emerald-modal-actions' });

		const confirmBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-primary',
			text: 'Close day ✓'
		});
		confirmBtn.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});

		const cancelBtn = actions.createEl('button', {
			cls: 'emerald-btn emerald-btn-secondary',
			text: 'Cancel'
		});
		cancelBtn.addEventListener('click', () => this.close());
	}

	private renderStatRow(container: HTMLElement, label: string, value: string, valueCls?: string) {
		const row = container.createDiv({ cls: 'emerald-closeday-row' });
		row.createSpan({ cls: 'emerald-closeday-label', text: label });
		const val = row.createSpan({ cls: 'emerald-closeday-value', text: value });
		if (valueCls) val.addClass(valueCls);
	}

	private formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = Math.round(minutes % 60);
		if (h === 0) return `${m}m`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	onClose() {
		this.contentEl.empty();
	}
}
