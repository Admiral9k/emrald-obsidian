// D5 and D6 leave Toggl projects out (engine change C1, 10/8). The API sends metadata.reason and
// metadata.excluded_provider_items; the words live here. Same three strings as the web Data Center
// (Emrald-freed-main data-center/+page.svelte, commit a0ef290): Devon approved the copy 10/8, cmo 3/3 PASS.
// Spec: emrald-work/build-specs/d5d6-web-copy-C1b-2026-10-08.md. Information, not an alert: muted text.

import { setIcon, setTooltip } from 'obsidian';

export type ProviderNoteState = 'empty' | 'partial' | null;

export const PROVIDER_TOOLTIP =
	'Toggl projects follow your Toggl timer habits, so a gap between sessions says nothing about avoidance or start-up delay. This metric looks at projects you start and manage in EMRALD.';

/** 'empty' = the user has only Toggl projects (value is null); 'partial' = some Toggl projects were left out. */
export function providerNoteState(key: string, metadata?: Record<string, unknown> | null): ProviderNoteState {
	if (key !== 'D5' && key !== 'D6') return null;
	if (metadata?.reason === 'provider_projects_excluded') return 'empty';
	return Number(metadata?.excluded_provider_items ?? 0) > 0 ? 'partial' : null;
}

export function providerLeftOut(metadata?: Record<string, unknown> | null): string {
	const n = Number(metadata?.excluded_provider_items ?? 0);
	return `${n} Toggl ${n === 1 ? 'project' : 'projects'} left out`;
}

/** Appends the note under the metric description. Returns false when this metric has nothing to say. */
export function renderProviderNote(parent: HTMLElement, key: string, metadata?: Record<string, unknown> | null): boolean {
	const state = providerNoteState(key, metadata);
	if (!state) return false;
	const note = parent.createDiv({ cls: 'emerald-wv-provider-note' });
	const icon = note.createSpan({ cls: 'emerald-wv-provider-note-icon', attr: { role: 'img' } });
	setIcon(icon, 'info');
	setTooltip(icon, PROVIDER_TOOLTIP, { placement: 'top' });
	const text = note.createSpan();
	if (state === 'empty') {
		text.createEl('strong', { text: 'No data yet.' });
		text.appendText(' This metric covers projects you manage in EMRALD. Your Toggl projects are left out of it, and they still count in your other metrics. Add a project in EMRALD to see this one.');
	} else {
		text.appendText(`Based on your EMRALD projects. ${providerLeftOut(metadata)}.`);
	}
	return true;
}
