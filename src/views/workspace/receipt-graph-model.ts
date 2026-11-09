// EMRALD receipt graph: pure model (no DOM, no Obsidian imports).
// Port of the web app's ReceiptGraph.svelte (Emrald-freed-main main 46fcfeb); spec: emrald-mcp
// docs/RECEIPT-GRAPH-SPEC.md v1.1 (Devon approved 11/8). Same six receipt values, same wording,
// same zone thresholds as the web twin and the plugin's own Data Center zones.
// Kept DOM-free so scripts/test-receipt-graph.cjs can bundle and exercise it in Node.

import type { ProjectReceipt, ProjectReceiptPage, APIResponse } from '../../api/client';

export type MetricKey =
	| 'perceived_effort'
	| 'demand_investment_balance'
	| 'hedonic_valence'
	| 'flow_occurred'
	| 'verification_share'
	| 'unexpected_complications';

export type Zone = 'good' | 'caution' | 'risk';

export interface Metric {
	key: MetricKey;
	label: string; // selector label: the receipt's own question, shortened
	question: string; // the full receipt wording, shown as the tooltip
	min: number;
	max: number;
	// Zone direction, same idea as the Data Center: 'up' higher is better, 'down' lower is better,
	// 'center' the middle is best. null = no good or bad (the dot keeps the neutral blue).
	dir: 'up' | 'down' | 'center' | null;
	words?: string[]; // 0..2 scales: the receipt's own answer words (index = value - min)
	axis?: string[]; // short axis labels for the 0..2 scales
}

// Labels follow the receipt wording, shortened but never unclear. Order = the receipt's order.
export const METRICS: Metric[] = [
	{ key: 'perceived_effort', label: 'How hard', question: 'How hard was that?', min: 1, max: 10, dir: 'down' },
	{ key: 'demand_investment_balance', label: 'Right amount of effort', question: 'Did you give the right amount of effort for what this needed?', min: 1, max: 10, dir: 'center' },
	{ key: 'hedonic_valence', label: 'How enjoyable', question: 'How pleasant was this work?', min: 1, max: 10, dir: 'up' },
	{ key: 'flow_occurred', label: 'Flow state', question: 'Were you in the zone?', min: 0, max: 2, dir: 'up', words: ['No', 'Somewhat', 'Yes'], axis: ['No', 'Some', 'Yes'] },
	{ key: 'verification_share', label: 'AI verification', question: 'How much of the work was checking what the AI produced? (Qarett receipts)', min: 1, max: 10, dir: null },
	{ key: 'unexpected_complications', label: 'Any complications', question: 'Any unexpected complications?', min: 0, max: 2, dir: 'down', words: ['None', 'Some', "You wouldn't believe me"], axis: ['None', 'Some', 'Lots'] }
];

export type RangeKey = 'all' | number;
export const RANGES: { key: RangeKey; label: string }[] = [
	{ key: 'all', label: 'All' },
	{ key: 7, label: '7 days' },
	{ key: 14, label: '14 days' },
	{ key: 30, label: '30 days' },
	{ key: 60, label: '60 days' }
];

export const ZONE_NAME: Record<Zone, string> = { good: 'Good', caution: 'Caution', risk: 'Risk' };

export const DEFAULT_COUNT = 50; // newest receipts shown until "Show all"
export const PHONE_COUNT = 20; // narrow panes: the chart crowds past about 20 dots
export const NARROW_PANE_PX = 720; // the web app's mobile breakpoint, applied to the pane width here
export const SHOW_ALL_CAP = 500; // pages of 100 (API max) up to this many

export const EMPTY_ALL = 'No receipts yet. Finish a session and rate it, or ask Qarett to file one.';

/**
 * Zone of a value. 'up' and 'down' use the Data Center thresholds exactly (n = value / max);
 * 'center' is symmetric around the middle of the 1 to 10 scale (5 to 6 good, 3 to 4 and 7 to 8
 * caution, 1 to 2 and 9 to 10 risk). null = the metric has no good or bad.
 */
export function zoneOf(m: Metric, v: number): Zone | null {
	if (m.dir === null) return null;
	const n = v / m.max;
	if (m.dir === 'up') return n >= 0.6 ? 'good' : n >= 0.28 ? 'caution' : 'risk';
	if (m.dir === 'down') return n <= 0.4 ? 'good' : n <= 0.72 ? 'caution' : 'risk';
	return v >= 5 && v <= 6 ? 'good' : v >= 3 && v <= 8 ? 'caution' : 'risk';
}

/**
 * Legend, built from the same function as the dots so it can never disagree. Numeric scales read
 * "Good 1-4", "Caution 3-4 and 7-8"; the word scales (flow, complications) show only the
 * receipt's own answer words, each with its color.
 */
export function zoneSpans(m: Metric): { zone: Zone; text: string; named: boolean }[] {
	if (m.dir === null) return [];
	if (m.words) {
		return m.words.map((w, i) => ({ zone: zoneOf(m, m.min + i) as Zone, text: w, named: false }));
	}
	const runs: Record<Zone, string[]> = { good: [], caution: [], risk: [] };
	let start = m.min;
	for (let v = m.min; v <= m.max; v++) {
		const z = zoneOf(m, v) as Zone;
		if (v === m.max || zoneOf(m, v + 1) !== z) {
			runs[z].push(start === v ? String(v) : `${start}-${v}`);
			start = v + 1;
		}
	}
	return (['good', 'caution', 'risk'] as Zone[])
		.filter((z) => runs[z].length)
		.map((z) => ({ zone: z, text: runs[z].join(' and '), named: true }));
}

export function valueText(m: Metric, v: number): string {
	return m.words ? m.words[v - m.min] : `${v}/${m.max}`;
}

export function formatDuration(min: number | null | undefined): string {
	if (min == null) return '';
	if (min >= 60) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
	return `${Math.round(min)}m`;
}

export function whenOf(r: ProjectReceipt): string {
	return r.session?.started_at ?? r.created_at;
}

export function shortDate(r: ProjectReceipt): string {
	return new Date(whenOf(r)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function longDate(r: ProjectReceipt): string {
	return new Date(whenOf(r)).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Numeric columns can arrive as strings from PostgREST; normalize once so the chart never plots NaN. */
export function normalizeReceipt(r: ProjectReceipt): ProjectReceipt {
	const num = (v: unknown): number | null => {
		if (v === null || v === undefined || v === '') return null;
		const n = typeof v === 'number' ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	};
	return {
		...r,
		perceived_effort: num(r.perceived_effort),
		demand_investment_balance: num(r.demand_investment_balance),
		hedonic_valence: num(r.hedonic_valence),
		flow_occurred: num(r.flow_occurred),
		verification_share: num(r.verification_share),
		unexpected_complications: num(r.unexpected_complications)
	};
}

/** Receipts that have a value for the metric (a NULL is a gap, never a zero). */
export function pointsFor(rows: ProjectReceipt[], key: MetricKey): ProjectReceipt[] {
	return rows.filter((r) => r[key] != null);
}

export function countsFor(rows: ProjectReceipt[]): Record<MetricKey, number> {
	return Object.fromEntries(METRICS.map((m) => [m.key, pointsFor(rows, m.key).length])) as Record<MetricKey, number>;
}

/** Text alternative for the chart, e.g. "12 receipts, How hard, range 3 to 8". */
export function chartLabel(m: Metric, points: ProjectReceipt[]): string {
	if (points.length === 0) return `No receipts for ${m.label}`;
	const vals = points.map((p) => p[m.key] as number);
	return `${points.length} receipt${points.length === 1 ? '' : 's'}, ${m.label}, range ${Math.min(...vals)} to ${Math.max(...vals)}`;
}

export function dotLabel(m: Metric, p: ProjectReceipt): string {
	const v = p[m.key] as number;
	const z = zoneOf(m, v);
	return `${shortDate(p)}, ${m.label} ${valueText(m, v)}${z ? ', ' + ZONE_NAME[z].toLowerCase() : ''}${p.ai_summary ? ', has a summary' : ''}`;
}

export function wantedCount(showAll: boolean, paneWidth: number): number {
	return showAll ? SHOW_ALL_CAP : paneWidth > 0 && paneWidth <= NARROW_PANE_PX ? PHONE_COUNT : DEFAULT_COUNT;
}

export interface LoadedReceipts {
	rows: ProjectReceipt[]; // oldest first (the line reads oldest to newest)
	total: number;
}

export interface ReceiptSource {
	getProjectReceipts(itemId: string, opts?: { from?: string; limit?: number; offset?: number }): Promise<APIResponse<ProjectReceiptPage>>;
}

/**
 * Pull up to `wanted` receipts for one project, newest first in pages of 100 (the API max), then
 * return them oldest first. `range` maps to the API's `from` param (no API change). Throws an Error
 * with a user-readable message on a failed page.
 */
export async function loadProjectReceipts(
	api: ReceiptSource,
	itemId: string,
	range: RangeKey,
	wanted: number,
	now: number = Date.now()
): Promise<LoadedReceipts> {
	const from = range === 'all' ? undefined : new Date(now - range * 86400000).toISOString();
	const got: ProjectReceipt[] = [];
	let total = 0;
	while (got.length < wanted) {
		const limit = Math.min(100, wanted - got.length);
		const res = await api.getProjectReceipts(itemId, { from, limit, offset: got.length });
		if (res.data === null || res.data === undefined) {
			throw new Error(res.status === 0 ? 'Offline. Receipts load when you reconnect.' : (res.error ?? 'Could not load receipts'));
		}
		const page = Array.isArray(res.data.data) ? res.data.data : [];
		total = typeof res.data.total === 'number' ? res.data.total : page.length;
		got.push(...page.map(normalizeReceipt));
		if (page.length < limit || got.length >= total) break;
	}
	return { rows: got.slice().reverse(), total };
}
