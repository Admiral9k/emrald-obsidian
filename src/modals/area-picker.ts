// Area Picker Modal (S100)
// Single-select "Area" for a project. Area/category is represented with the generic label/item_label
// tables (Option B, Devon S100), but the UI treats it as SINGLE-SELECT: one area-label per project.
// This is a UI convention, NOT a DB constraint. Setting a new area detaches the previous area-label
// and attaches the new one.
//
// Pick-or-create: existing labels are listed; typing a new name offers "Create area <name>".
// Also offers a "No area" option to clear.

import { App, SuggestModal } from 'obsidian';
import { Label } from '../api/client';

// A row in the picker: an existing label, the create-new affordance, or the clear affordance.
type AreaChoice =
	| { kind: 'label'; label: Label }
	| { kind: 'create'; name: string }
	| { kind: 'clear' };

export class AreaPickerModal extends SuggestModal<AreaChoice> {
	private labels: Label[];
	private currentAreaId: string | null;
	private onChoose: (choice: AreaChoice) => void;

	constructor(
		app: App,
		labels: Label[],
		currentAreaId: string | null,
		onChoose: (choice: AreaChoice) => void,
	) {
		super(app);
		this.labels = labels;
		this.currentAreaId = currentAreaId;
		this.onChoose = onChoose;
		this.setPlaceholder('Set area — type to search or create');
		this.limit = 50;
	}

	getSuggestions(query: string): AreaChoice[] {
		const q = query.trim().toLowerCase();
		const matches = this.labels
			.filter((l) => !q || l.name.toLowerCase().includes(q))
			.map((l): AreaChoice => ({ kind: 'label', label: l }));

		const results: AreaChoice[] = [];

		// Offer "clear" only if the project currently has an area and the query is empty.
		if (this.currentAreaId && !q) {
			results.push({ kind: 'clear' });
		}

		results.push(...matches);

		// Offer create when the typed name doesn't exactly match an existing label.
		const exact = this.labels.some((l) => l.name.toLowerCase() === q);
		if (q && !exact) {
			results.push({ kind: 'create', name: query.trim() });
		}

		return results;
	}

	renderSuggestion(choice: AreaChoice, el: HTMLElement): void {
		el.addClass('emrald-area-suggestion');
		if (choice.kind === 'clear') {
			el.createSpan({ text: 'No area (clear)' });
			return;
		}
		if (choice.kind === 'create') {
			el.createSpan({ text: `Create area "${choice.name}"` });
			return;
		}
		// Existing label — show a color dot + name, mark the current one.
		const dot = el.createSpan({ cls: 'emrald-area-dot' });
		if (choice.label.color) dot.style.backgroundColor = choice.label.color;
		el.createSpan({ text: choice.label.name });
		if (choice.label.id === this.currentAreaId) {
			el.createSpan({ cls: 'emrald-area-current', text: '  (current)' });
		}
	}

	onChooseSuggestion(choice: AreaChoice): void {
		this.onChoose(choice);
	}
}
