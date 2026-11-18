// Change ONE profile answer without retaking the whole queue (1.4.4, parity with the web AnswerEditModal and its
// profile-questions.ts). DOM-free: the question lookup, the direction hints and the save rules live here so a Node
// test can drive them. The modal in answer-edit.ts only draws.
import { QUESTIONS, Opt } from '../onboarding/questions';
import { ADVANCED_QUESTIONS } from '../onboarding/advanced-questions';
import type { TraitComparison } from '../api/client';

export type EditKind = 'scale' | 'enum' | 'text';
export interface EditQuestion {
	key: string;
	question: string;
	kind: EditKind;
	options?: Opt[];
	low?: string;
	high?: string;
}

/** Every question the profile can hold, simple and advanced, in one shape. An advanced slider is a 1 to 5 scale. */
const ALL: EditQuestion[] = [
	...QUESTIONS.map((q): EditQuestion => ({ key: q.key, question: q.question, kind: q.type, options: q.options, low: q.low, high: q.high })),
	...ADVANCED_QUESTIONS.map((q): EditQuestion => ({
		key: q.key,
		question: q.question,
		kind: q.type === 'slider' ? 'scale' : q.type === 'text' ? 'text' : 'enum',
		options: q.options,
		low: q.endpointLeft,
		high: q.endpointRight
	}))
];

export const EDITABLE_BY_KEY: Record<string, EditQuestion> = Object.fromEntries(ALL.map((q) => [q.key, q]));

export type AnswerValue = string | number;

/** The saved answer as the editor holds it: a number for a scale, a string for the rest, undefined for anything else. */
export function toAnswerValue(raw: unknown): AnswerValue | undefined {
	return typeof raw === 'number' || typeof raw === 'string' ? raw : undefined;
}

/** Save is allowed only for a real change: something picked, text not blank, and different from the saved answer. */
export function canSave(picked: AnswerValue | undefined, current: AnswerValue | undefined): boolean {
	if (picked === undefined) return false;
	if (typeof picked === 'string' && picked.trim().length === 0) return false;
	return picked !== current;
}

/** The value sent to PATCH /profile/questions. Text is trimmed; scales and options go as picked. */
export function valueToSave(q: EditQuestion, picked: AnswerValue): AnswerValue {
	return q.kind === 'text' && typeof picked === 'string' ? picked.trim() : picked;
}

/**
 * A DIRECTION from the profile comparison (never a value to pick), shown only on a flagged question. The wording is the
 * cmo-gated web wording (Emrald-freed effort-profile page, directionHint).
 */
export function directionHint(key: string, cmp: TraitComparison | undefined): string | null {
	if (!cmp) return null;
	switch (key) {
		case 'procrastination_tendency':
			if (cmp.reason === 'reports_more_than_observed') return 'Your recent sessions show you starting sooner than this answer says.';
			if (cmp.reason === 'observed_more_than_reports') return 'Your recent sessions show you starting later than this answer says.';
			return null;
		case 'stress_vulnerability':
			if (cmp.reason === 'reports_more_than_observed') return 'Your recent sessions show fewer burnout signals than this answer says.';
			if (cmp.reason === 'observed_more_than_reports') return 'Your recent sessions show more burnout signals than this answer says.';
			return null;
		case 'working_genius_primary':
			return 'Your recent completion rate runs lower than a finishing-first answer suggests.';
		case 'chronotype':
			return cmp.observed ? `Your recent sessions show ${cmp.observed}.` : null;
		default:
			return null;
	}
}

export const EDIT_COPY = {
	title: 'Change your answer',
	current: 'Current answer',
	save: 'Save answer',
	cancel: 'Cancel',
	change: 'Change',
	error: 'Could not save your answer. Try again.'
};
