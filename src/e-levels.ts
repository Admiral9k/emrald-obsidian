// EMRALD Custom E-Levels — the ONE client-side resolver used by every surface.
//
// A "level ref" is either a built-in level ('E1'|'E2'|'E3'|'E4') or a custom
// level reference ('EC:<uuid>'). The API accepts and returns the single
// `effort_level` field in both forms; the storage duality is invisible here.
//
// Rules (frozen decisions — do not re-derive elsewhere):
//   • Built-in percents: E1=25, E2=50, E3=75, E4=100.
//   • Custom percents live on the 5–100 axis, step 5.
//   • The reserved percents 25/50/75/100 resolve to the built-in level — a
//     custom level is never created at one of them.
//   • Colour is INTERPOLATED from percent along the E1→E4 ramp and computed
//     on demand, never stored.
//   • The visible badge for every custom level is the uniform string "EC".
//     The full name belongs in tooltips and prose. Raw 'EC:<uuid>' must never
//     reach user-visible text or synced markdown bodies.
//   • Percent edits are locked once a level is referenced by an item; the
//     server enforces it and the client mirrors the error.
//
// Usage:
//   import { eLevelStore, resolveLevelPercent, colorForPercent } from '../e-levels';
//   const pct = resolveLevelPercent(item.effort_level);      // 0–100
//   badge.style.color = colorForLevel(item.effort_level);

import type { CustomELevel } from './api/client';
import type EmraldPlugin from '../main';

// ── Constants ───────────────────────────────────────────────

export const BUILT_IN_LEVELS = ['E1', 'E2', 'E3', 'E4'] as const;
export type BuiltInLevel = typeof BUILT_IN_LEVELS[number];

/** A level reference: 'E1'..'E4' or 'EC:<uuid>'. */
export type LevelRef = string;

export const BUILT_IN_PERCENT: Record<BuiltInLevel, number> = {
	E1: 25,
	E2: 50,
	E3: 75,
	E4: 100
};

export const BUILT_IN_COLORS: Record<BuiltInLevel, string> = {
	E1: '#2D7A4A',
	E2: '#B8912E',
	E3: '#C06A30',
	E4: '#B54545'
};

export const BUILT_IN_LABELS: Record<BuiltInLevel, string> = {
	E1: 'Light',
	E2: 'Moderate',
	E3: 'Demanding',
	E4: 'Maximum'
};

/** Prefix that marks a custom level reference. */
export const CUSTOM_REF_PREFIX = 'EC:';

/** Uniform badge text for every custom level. */
export const CUSTOM_BADGE = 'EC';

/** Percent axis for custom levels. */
export const PERCENT_MIN = 5;
export const PERCENT_MAX = 100;
export const PERCENT_STEP = 5;

/** Percents that belong to a built-in level and can't be used by a custom one. */
export const RESERVED_PERCENTS: readonly number[] = [25, 50, 75, 100];

/** Name constraints (case-insensitive uniqueness is enforced server-side). */
export const NAME_MAX_LENGTH = 20;

/** Fallback percent when a ref can't be resolved at all (mirrors legacy `?? 0.5`). */
const FALLBACK_PERCENT = 50;

// ── Ref helpers ─────────────────────────────────────────────

export function isBuiltInLevel(ref: string | null | undefined): ref is BuiltInLevel {
	return ref === 'E1' || ref === 'E2' || ref === 'E3' || ref === 'E4';
}

export function isCustomLevelRef(ref: string | null | undefined): boolean {
	return typeof ref === 'string' && ref.startsWith(CUSTOM_REF_PREFIX) && ref.length > CUSTOM_REF_PREFIX.length;
}

/** Extract the uuid from an 'EC:<uuid>' ref, or null if it isn't one. */
export function customLevelId(ref: string | null | undefined): string | null {
	if (!isCustomLevelRef(ref)) return null;
	return (ref as string).slice(CUSTOM_REF_PREFIX.length);
}

/** Build the ref string for a custom level id. */
export function customLevelRef(id: string): string {
	return `${CUSTOM_REF_PREFIX}${id}`;
}

/** True for any ref shape this client understands. */
export function isValidLevelRef(ref: string | null | undefined): boolean {
	return isBuiltInLevel(ref) || isCustomLevelRef(ref);
}

// ── Percent ↔ built-in ──────────────────────────────────────

/**
 * The built-in level that owns this percent, or null if the percent is free
 * for a custom level. Used for the creator's snap-to-built-in notice.
 */
export function reservedBuiltInForPercent(percent: number): BuiltInLevel | null {
	for (const level of BUILT_IN_LEVELS) {
		if (BUILT_IN_PERCENT[level] === percent) return level;
	}
	return null;
}

/** Nearest built-in level to an arbitrary percent (ties round down / lighter). */
export function nearestBuiltIn(percent: number): BuiltInLevel {
	let best: BuiltInLevel = 'E1';
	let bestDelta = Number.POSITIVE_INFINITY;
	for (const level of BUILT_IN_LEVELS) {
		const delta = Math.abs(BUILT_IN_PERCENT[level] - percent);
		if (delta < bestDelta) {
			bestDelta = delta;
			best = level;
		}
	}
	return best;
}

/** Clamp + snap an arbitrary number onto the custom percent axis (5–100 step 5). */
export function normalizePercent(percent: number): number {
	if (!isFinite(percent)) return FALLBACK_PERCENT;
	const clamped = Math.min(PERCENT_MAX, Math.max(PERCENT_MIN, percent));
	return Math.round(clamped / PERCENT_STEP) * PERCENT_STEP;
}

// ── Colour ramp ─────────────────────────────────────────────

interface ColorAnchor { percent: number; rgb: [number, number, number] }

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16)
	];
}

function rgbToHex(rgb: [number, number, number]): string {
	const part = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

const COLOR_ANCHORS: ColorAnchor[] = BUILT_IN_LEVELS.map(level => ({
	percent: BUILT_IN_PERCENT[level],
	rgb: hexToRgb(BUILT_IN_COLORS[level])
}));

/**
 * Derived colour for a percent, piecewise-linear between the four anchor
 * percents (25/50/75/100). Below 25 the E1 colour is held (clamped in the E1
 * direction — there is no anchor to extrapolate toward); above 100 holds E4.
 * Computed, never stored.
 */
export function colorForPercent(percent: number): string {
	if (!isFinite(percent)) return BUILT_IN_COLORS.E2;
	const first = COLOR_ANCHORS[0];
	const last = COLOR_ANCHORS[COLOR_ANCHORS.length - 1];
	if (percent <= first.percent) return rgbToHex(first.rgb);
	if (percent >= last.percent) return rgbToHex(last.rgb);

	for (let i = 0; i < COLOR_ANCHORS.length - 1; i++) {
		const lo = COLOR_ANCHORS[i];
		const hi = COLOR_ANCHORS[i + 1];
		if (percent >= lo.percent && percent <= hi.percent) {
			const span = hi.percent - lo.percent;
			const t = span === 0 ? 0 : (percent - lo.percent) / span;
			return rgbToHex([
				lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * t,
				lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * t,
				lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * t
			]);
		}
	}
	return rgbToHex(last.rgb);
}

// ── Resolution against the cached custom-level list ─────────

/**
 * Percent (0–100) prescribed by a level ref. Built-ins use the frozen table;
 * customs read the cached list (including archived levels, so historical
 * assignments still resolve). Unknown refs fall back to 50%.
 */
export function resolveLevelPercent(ref: string | null | undefined, levels?: readonly CustomELevel[]): number {
	if (isBuiltInLevel(ref)) return BUILT_IN_PERCENT[ref];
	const custom = findCustom(ref, levels);
	if (custom) return custom.percent;
	return FALLBACK_PERCENT;
}

/** Same as resolveLevelPercent but as a 0–1 fraction (for minute math). */
export function resolveLevelFraction(ref: string | null | undefined, levels?: readonly CustomELevel[]): number {
	return resolveLevelPercent(ref, levels) / 100;
}

/** Prescribed minutes for a level ref against a day's available hours. */
export function prescribedMinutes(ref: string | null | undefined, availableHours: number, levels?: readonly CustomELevel[]): number {
	return availableHours * 60 * resolveLevelFraction(ref, levels);
}

/** Derived colour for a level ref. */
export function colorForLevel(ref: string | null | undefined, levels?: readonly CustomELevel[]): string {
	if (isBuiltInLevel(ref)) return BUILT_IN_COLORS[ref];
	if (isCustomLevelRef(ref)) return colorForPercent(resolveLevelPercent(ref, levels));
	return 'var(--text-muted)';
}

/**
 * The short string shown in a badge. Built-ins show themselves; every custom
 * level shows the uniform "EC". Never returns a raw 'EC:<uuid>'.
 */
export function levelBadgeText(ref: string | null | undefined): string {
	if (isBuiltInLevel(ref)) return ref;
	if (isCustomLevelRef(ref)) return CUSTOM_BADGE;
	return '';
}

/**
 * The full human name for prose and tooltips: 'E1' for built-ins, the custom
 * level's name for customs, and a neutral placeholder when the ref can't be
 * resolved. Never leaks the uuid.
 */
export function levelDisplayName(ref: string | null | undefined, levels?: readonly CustomELevel[]): string {
	if (isBuiltInLevel(ref)) return ref;
	if (isCustomLevelRef(ref)) {
		const custom = findCustom(ref, levels);
		return custom ? custom.name : 'Custom level';
	}
	return '';
}

/**
 * Badge + name combined the way prose wants it: 'E2' or 'EC — Deep research'.
 * Safe for markdown sync surfaces.
 */
export function levelLabel(ref: string | null | undefined, levels?: readonly CustomELevel[]): string {
	if (isBuiltInLevel(ref)) return ref;
	if (isCustomLevelRef(ref)) return `${CUSTOM_BADGE} — ${levelDisplayName(ref, levels)}`;
	return '';
}

/** Tooltip text: name plus percent, e.g. 'Deep research — 40% of your daily work time'. */
export function levelTooltip(ref: string | null | undefined, levels?: readonly CustomELevel[]): string {
	const name = levelDisplayName(ref, levels);
	if (!name) return '';
	const pct = resolveLevelPercent(ref, levels);
	return `${name} — ${pct}% of your daily work time`;
}

/** Whether a ref points at a custom level that has been archived. */
export function isArchivedLevel(ref: string | null | undefined, levels?: readonly CustomELevel[]): boolean {
	const custom = findCustom(ref, levels);
	return !!custom?.archived_at;
}

function findCustom(ref: string | null | undefined, levels?: readonly CustomELevel[]): CustomELevel | null {
	const id = customLevelId(ref);
	if (!id) return null;
	const list = levels ?? eLevelStore.all();
	for (const level of list) {
		if (level.id === id) return level;
	}
	return null;
}

// ── Name validation (mirrors the server contract) ───────────

/**
 * Client-side name gate. Returns an error string, or null when acceptable.
 * The server is authoritative for uniqueness; this catches the obvious cases
 * before a round trip.
 */
export function validateCustomLevelName(
	raw: string,
	opts?: { levels?: readonly CustomELevel[]; ignoreId?: string }
): string | null {
	const name = raw.trim();
	if (!name) return 'Name is required.';
	if (name.length > NAME_MAX_LENGTH) return `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
	if (isBuiltInLevel(name.toUpperCase())) return `${name.toUpperCase()} is a built-in level name.`;
	const list = opts?.levels ?? eLevelStore.all();
	const lower = name.toLowerCase();
	for (const level of list) {
		if (level.id === opts?.ignoreId) continue;
		if (level.archived_at) continue;
		if (level.name.toLowerCase() === lower) return 'You already have a level with that name.';
	}
	return null;
}

/**
 * ref_count semantics: null means "unknown" and the UI must assume the level
 * IS referenced (so percent stays locked).
 */
export function assumeReferenced(refCount: number | null | undefined): boolean {
	if (refCount === null || refCount === undefined) return true;
	return refCount > 0;
}

/** Display copy for a reference count. */
export function refCountLabel(refCount: number | null | undefined): string {
	if (refCount === null || refCount === undefined) return 'usage unknown';
	if (refCount === 0) return 'not used by any project';
	return `used by ${refCount} project${refCount === 1 ? '' : 's'}`;
}

// ── Cache ───────────────────────────────────────────────────

/** Settings key the custom-level list is persisted under (ad-hoc flag convention). */
export const ELEVEL_CACHE_KEY = '_customELevels';
const ELEVEL_CACHE_FETCHED_KEY = '_customELevelsFetchedAt';

/** How long a fetched list stays fresh before a settings-tab open re-fetches. */
const STALE_MS = 60_000;

function isCustomELevel(value: unknown): value is CustomELevel {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.percent === 'number';
}

function normalizeLevel(value: CustomELevel): CustomELevel {
	return {
		id: value.id,
		name: value.name,
		percent: value.percent,
		created_at: typeof value.created_at === 'string' ? value.created_at : '',
		archived_at: typeof value.archived_at === 'string' ? value.archived_at : null,
		ref: typeof value.ref === 'string' && value.ref ? value.ref : customLevelRef(value.id),
		ref_count: typeof value.ref_count === 'number' ? value.ref_count : null
	};
}

/**
 * In-memory + settings-backed cache of the user's custom levels.
 * Offline display is tolerably stale: the list is refreshed on plugin load and
 * after every mutation, and persisted so a cold start renders before the
 * network answers.
 */
class ELevelStore {
	private levels: CustomELevel[] = [];
	private fetchedAt = 0;
	private inFlight: Promise<boolean> | null = null;
	private lastError: string | null = null;

	/** Restore from persisted plugin settings (call once during onload). */
	hydrate(raw: unknown, fetchedAt?: unknown): void {
		if (Array.isArray(raw)) {
			this.levels = raw.filter(isCustomELevel).map(normalizeLevel);
			this.levels.sort((a, b) => a.percent - b.percent);
		}
		if (typeof fetchedAt === 'number') this.fetchedAt = fetchedAt;
	}

	/** Every known level, archived included (needed to resolve historical refs). */
	all(): readonly CustomELevel[] {
		return this.levels;
	}

	/** Levels the user can still assign. */
	active(): CustomELevel[] {
		return this.levels.filter(l => !l.archived_at);
	}

	/** Levels that are archived — render only where labelling history. */
	archived(): CustomELevel[] {
		return this.levels.filter(l => !!l.archived_at);
	}

	byId(id: string | null): CustomELevel | null {
		if (!id) return null;
		return this.levels.find(l => l.id === id) ?? null;
	}

	byRef(ref: string | null | undefined): CustomELevel | null {
		return this.byId(customLevelId(ref));
	}

	/** Last refresh error, if the most recent fetch failed. */
	get error(): string | null {
		return this.lastError;
	}

	isStale(ttlMs: number = STALE_MS): boolean {
		return Date.now() - this.fetchedAt > ttlMs;
	}

	/** Force the next refresh() to hit the network. */
	invalidate(): void {
		this.fetchedAt = 0;
	}

	/**
	 * Fetch the list and persist it. Resolves to true when the cached list
	 * actually changed (so callers can skip a redraw). Concurrent callers share
	 * one request. Never throws.
	 */
	async refresh(plugin: EmraldPlugin): Promise<boolean> {
		if (this.inFlight) return this.inFlight;
		this.inFlight = this.doRefresh(plugin).finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	private async doRefresh(plugin: EmraldPlugin): Promise<boolean> {
		if (!plugin.settings.apiKey) return false;
		let resp;
		try {
			resp = await plugin.apiClient.listELevels();
		} catch {
			this.lastError = 'Could not reach EMRALD.';
			return false;
		}
		if (resp.error || !resp.data) {
			this.lastError = resp.error ?? null;
			return false;
		}
		this.lastError = null;
		const next = resp.data.filter(isCustomELevel).map(normalizeLevel);
		next.sort((a, b) => a.percent - b.percent);
		const changed = JSON.stringify(next) !== JSON.stringify(this.levels);
		this.levels = next;
		this.fetchedAt = Date.now();
		await this.persist(plugin);
		return changed;
	}

	/** Merge one mutated level into the cache without a full refetch. */
	upsert(level: CustomELevel): void {
		const normalized = normalizeLevel(level);
		const idx = this.levels.findIndex(l => l.id === normalized.id);
		if (idx >= 0) {
			this.levels[idx] = normalized;
		} else {
			this.levels.push(normalized);
		}
		this.levels.sort((a, b) => a.percent - b.percent);
	}

	/** Drop a level from the cache (hard delete on the server). */
	remove(id: string): void {
		this.levels = this.levels.filter(l => l.id !== id);
	}

	async persist(plugin: EmraldPlugin): Promise<void> {
		const bag = plugin.settings as unknown as Record<string, unknown>;
		bag[ELEVEL_CACHE_KEY] = this.levels;
		bag[ELEVEL_CACHE_FETCHED_KEY] = this.fetchedAt;
		await plugin.saveData(plugin.settings);
	}

	reset(): void {
		this.levels = [];
		this.fetchedAt = 0;
		this.lastError = null;
	}
}

/** Singleton — the single source of custom-level truth for every surface. */
export const eLevelStore = new ELevelStore();

/** Hydrate the store from persisted settings. Call during plugin onload. */
export function hydrateELevelStore(plugin: EmraldPlugin): void {
	const bag = plugin.settings as unknown as Record<string, unknown>;
	eLevelStore.hydrate(bag[ELEVEL_CACHE_KEY], bag[ELEVEL_CACHE_FETCHED_KEY]);
}
