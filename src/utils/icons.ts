// EMRALD Icon Utilities
// Wraps Obsidian's setIcon for consistent Lucide icon usage.
// Never use emoji in the UI — always use these helpers.

import { setIcon } from 'obsidian';

/**
 * Create an icon element with a Lucide icon.
 * Returns a <span> with the SVG inserted.
 */
export function createIconEl(parent: HTMLElement, iconId: string, cls?: string): HTMLElement {
	const span = parent.createSpan({ cls: cls || 'emerald-icon' });
	setIcon(span, iconId);
	return span;
}

/**
 * Set a Lucide icon on an existing element.
 */
export function setEmraldIcon(el: HTMLElement, iconId: string): void {
	setIcon(el, iconId);
}

// ── Icon name constants for consistent usage ────────────

export const ICONS = {
	// Sidebar sections
	gem: 'gem',
	timer: 'timer',
	barChart: 'bar-chart-2',
	trendingUp: 'trending-up',
	lightbulb: 'lightbulb',
	user: 'user',
	flame: 'flame',
	clipboardList: 'clipboard-list',
	folder: 'folder',
	folderOpen: 'folder-open',
	target: 'target',
	zap: 'zap',
	sparkles: 'sparkles',
	sun: 'sun',
	link: 'link',

	// Actions
	play: 'play',
	pause: 'pause',
	square: 'square',      // stop
	pencil: 'pencil',
	checkCircle: 'check-circle',
	x: 'x',
	plus: 'plus',
	chevronRight: 'chevron-right',
	chevronDown: 'chevron-down',

	// Status
	circle: 'circle',       // generic dot
	alertTriangle: 'alert-triangle',
	info: 'info',
	refresh: 'refresh-cw',
} as const;
