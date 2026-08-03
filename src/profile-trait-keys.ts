// EMRALD — A-category profile trait keys (SHARED CONSTANT, mirror)
//
// SEQ-4+5 guardrail (S102). These `advanced_answers` JSONB keys are written by 4 paths
// (onboarding + reassessment × plugin + web). JSONB has no schema enforcement, so a single
// typo silently creates a junk field. This constant is the single reference for those key
// names in the plugin, so a rename fails at compile time in ONE place.
//
// MIRROR of emrald-api/src/engine/profile-trait-keys.ts — the API copy is SOURCE OF RECORD.
// If they drift, the API wins; keep this in sync.

export const A_TRAIT_KEYS = {
	chronotype: 'chronotype',
	stress_vulnerability: 'stress_vulnerability',
	procrastination_tendency: 'procrastination_tendency',
	working_genius_primary: 'working_genius_primary',
} as const;

export type ATraitKey = (typeof A_TRAIT_KEYS)[keyof typeof A_TRAIT_KEYS];
