// EMRALD Frontmatter Bridge
// Reads and writes EMRALD metadata to/from Obsidian note YAML frontmatter.
// NEVER touches note content — only frontmatter.

import { App, TFile, CachedMetadata } from 'obsidian';

export interface EmraldFrontmatter {
	'emrald-id': string;
	'effort-level': 'E1' | 'E2' | 'E3' | 'E4';
	'status': 'active' | 'paused' | 'completed' | 'abandoned';
	'sessions': number;
	'last-session': string | null;
	'total-minutes': number;
}

const EMRALD_FIELDS: (keyof EmraldFrontmatter)[] = [
	'emrald-id',
	'effort-level',
	'status',
	'sessions',
	'last-session',
	'total-minutes'
];

/**
 * Read EMRALD frontmatter fields from a note.
 * Returns null if the note has no emrald-id (not an EMRALD-tracked note).
 */
export function readEmraldFrontmatter(app: App, file: TFile): Partial<EmraldFrontmatter> | null {
	const cache: CachedMetadata | null = app.metadataCache.getFileCache(file);
	if (!cache?.frontmatter) return null;

	const fm = cache.frontmatter;
	if (!fm['emrald-id']) return null;

	const result: Partial<EmraldFrontmatter> = {};
	for (const key of EMRALD_FIELDS) {
		if (fm[key] !== undefined) {
			(result as Record<string, unknown>)[key] = fm[key];
		}
	}
	return result;
}

/**
 * Write EMRALD fields to a note's frontmatter.
 * Creates frontmatter if it doesn't exist. Preserves all non-EMRALD fields.
 */
export async function writeEmraldFrontmatter(
	app: App,
	file: TFile,
	fields: Partial<EmraldFrontmatter>
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		for (const [key, value] of Object.entries(fields)) {
			if (value !== undefined) {
				fm[key] = value;
			}
		}
	});
}

const VALID_EFFORT_LEVELS = ['E1', 'E2', 'E3', 'E4'];

/**
 * Initialize EMRALD frontmatter on a note that hasn't been tracked yet.
 * Validates effort level before writing.
 */
export async function initializeEmraldFrontmatter(
	app: App,
	file: TFile,
	emraldId: string,
	effortLevel: 'E1' | 'E2' | 'E3' | 'E4'
): Promise<void> {
	if (!emraldId || typeof emraldId !== 'string') return;
	if (!VALID_EFFORT_LEVELS.includes(effortLevel)) return;

	await writeEmraldFrontmatter(app, file, {
		'emrald-id': emraldId,
		'effort-level': effortLevel,
		'status': 'active',
		'sessions': 0,
		'last-session': null,
		'total-minutes': 0
	});
}

/**
 * Check if a note is tracked by EMRALD (has emrald-id in frontmatter).
 */
export function isEmraldNote(app: App, file: TFile): boolean {
	const cache = app.metadataCache.getFileCache(file);
	return !!cache?.frontmatter?.['emrald-id'];
}

/**
 * Get the emrald-id from a note's frontmatter, or null if not tracked.
 */
export function getEmraldId(app: App, file: TFile): string | null {
	const cache = app.metadataCache.getFileCache(file);
	return cache?.frontmatter?.['emrald-id'] ?? null;
}

/**
 * Get the effort-level from a note's frontmatter, or null if not set.
 */
export function getEffortLevel(app: App, file: TFile): 'E1' | 'E2' | 'E3' | 'E4' | null {
	const cache = app.metadataCache.getFileCache(file);
	const level = cache?.frontmatter?.['effort-level'];
	if (level && ['E1', 'E2', 'E3', 'E4'].includes(level)) {
		return level as 'E1' | 'E2' | 'E3' | 'E4';
	}
	return null;
}

/**
 * Update session stats in frontmatter after a session completes.
 * Validates inputs before writing to prevent garbage in frontmatter.
 */
export async function updateSessionStats(
	app: App,
	file: TFile,
	sessionCount: number,
	totalMinutes: number,
	lastSessionDate: string
): Promise<void> {
	// Validate: must be finite numbers and a non-empty date string
	if (typeof sessionCount !== 'number' || !isFinite(sessionCount) || sessionCount < 0) return;
	if (typeof totalMinutes !== 'number' || !isFinite(totalMinutes) || totalMinutes < 0) return;
	if (typeof lastSessionDate !== 'string' || !lastSessionDate.trim()) return;

	await writeEmraldFrontmatter(app, file, {
		'sessions': Math.round(sessionCount),
		'total-minutes': Math.round(totalMinutes),
		'last-session': lastSessionDate
	});
}

/**
 * Build a map of emrald-id → file path by scanning all vault markdown files.
 * Used to resolve note paths for API-loaded items that don't carry note paths.
 * Wrapped in try/catch per-file so one note with bad frontmatter can't crash the scan.
 */
export function buildNotePathMap(app: App): Map<string, string> {
	const map = new Map<string, string>();
	const files = app.vault.getMarkdownFiles();
	for (const file of files) {
		try {
			const id = getEmraldId(app, file);
			if (id) {
				map.set(id, file.path);
			}
		} catch { /* non-fatal */
			// Skip files with malformed frontmatter — don't crash the whole scan
		}
	}
	return map;
}
