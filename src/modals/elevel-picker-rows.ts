// Shared custom-level rows for the e-level pickers.
//
// Both pickers (ELevelModal, NewProjectModal) render E1–E4 and then call this
// to append the user's custom levels in the identical row shape. Kept in one
// place so the two pickers can't drift.
//
// The raw 'EC:<uuid>' ref is only ever used as a callback value — never as
// visible text. Badge is the uniform "EC" tinted by the derived colour; the
// full name carries the meaning.

import { Notice } from 'obsidian';
import EmraldPlugin from '../../main';
import { CUSTOM_BADGE, colorForPercent, eLevelStore, levelTooltip } from '../e-levels';
import { tierState } from '../tier';
import { openELevelSettings } from '../utils/settings-nav';

/** Exact copy for the inert pointer row (also shown to every free-tier user). */
export const CUSTOM_LEVEL_POINTER_TEXT = '(PRO) Custom level creation located in settings';

export interface CustomLevelRowOptions {
	/** The same container the E1–E4 buttons were appended to. */
	container: HTMLElement;
	plugin: EmraldPlugin;
	availableHours: number;
	/** Currently assigned level ref, so a custom row can render as active. */
	currentLevel: string;
	/** Called with the custom level's ref when a row is picked. */
	onPick: (ref: string) => void;
}

/**
 * Append the custom-level rows (or the Pro pointer row) below the built-ins.
 *
 * Pro with ≥1 active custom → selectable rows.
 * Pro with 0 customs       → the pointer row.
 * Free tier                → any existing customs render inert, plus the
 *                            pointer row (the locked settings section carries
 *                            the actual upgrade pitch).
 */
export function renderCustomLevelRows(opts: CustomLevelRowOptions): void {
	const { container, plugin, availableHours, currentLevel, onPick } = opts;
	const customs = eLevelStore.active();
	const isPro = tierState.isPro();

	if (customs.length > 0) {
		container.createDiv({ cls: 'emerald-elevel-divider' });
	}

	for (const level of customs) {
		const prescribedHours = (availableHours * level.percent / 100).toFixed(1);
		const isActive = currentLevel === level.ref;
		const btn = container.createEl('button', {
			cls: [
				'emerald-elevel-option',
				'emerald-elevel-option-custom',
				isActive ? 'is-active' : '',
				isPro ? '' : 'is-inert'
			].filter(Boolean).join(' ')
		});
		btn.setAttribute('aria-label', levelTooltip(level.ref, [level]));

		const labelRow = btn.createDiv({ cls: 'emerald-elevel-option-label' });
		const badge = labelRow.createSpan({ cls: 'emerald-elevel-option-level', text: CUSTOM_BADGE });
		badge.style.color = colorForPercent(level.percent);
		labelRow.createSpan({
			cls: 'emerald-elevel-option-desc',
			text: `${level.name} — ${level.percent}% of your daily work time`
		});

		btn.createDiv({
			cls: 'emerald-elevel-option-time',
			text: `~${prescribedHours}h on a ${availableHours}h day`
		});

		if (!isPro) {
			btn.disabled = true;
			btn.addEventListener('click', () => {
				new Notice('Custom e-levels are a PRO feature.');
			});
			continue;
		}

		btn.addEventListener('click', () => onPick(level.ref));
	}

	// Pointer row: whenever there is nothing to pick, and always on free tier.
	if (customs.length === 0 || !isPro) {
		const pointer = container.createDiv({
			cls: 'emerald-elevel-option emerald-elevel-option-pointer',
			text: CUSTOM_LEVEL_POINTER_TEXT,
			attr: { role: 'button', tabindex: '0' }
		});
		const open = (): void => openELevelSettings(plugin);
		pointer.addEventListener('click', open);
		pointer.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				open();
			}
		});
	}
}
