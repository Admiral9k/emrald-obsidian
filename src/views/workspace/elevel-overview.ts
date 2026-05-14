// EMRALD E-Level Overview — Bird's-eye view of all projects and effort allocation.
// Shows: E-level filter cards, project table, allocation summary, suggestions.
// Click an E-level card to filter the project list.
// Expandable ⓘ info on each card, clickable project names → open note,
// "What is effort management?" link → About EMRALD view.

import { WorkspaceLeaf, setIcon, Notice, TFile } from 'obsidian';
import EmraldPlugin from '../../../main';
import { EmraldWorkspaceView, VIEW_ELEVEL_OVERVIEW } from './base';
import { VIEW_ABOUT } from './base';
import { TrackedItem } from '../../api/client';

const E_LEVEL_PCT: Record<string, number> = { E1: 25, E2: 50, E3: 75, E4: 100 };

const E_LEVEL_META: Record<string, { label: string; desc: string; detail: string }> = {
	E1: {
		label: 'E1 — Light',
		desc: '25% of your daily hours',
		detail: 'Low-effort tasks you can sustain indefinitely — quick check-ins, light reading, routine maintenance. These barely dent your energy budget.'
	},
	E2: {
		label: 'E2 — Moderate',
		desc: '50% of your daily hours',
		detail: 'Meaningful work that requires focus but not peak performance — writing, planning, steady progress on familiar projects.'
	},
	E3: {
		label: 'E3 — Demanding',
		desc: '75% of your daily hours',
		detail: 'High-effort work that taxes your energy significantly — complex problem-solving, learning new skills, deep creative work. Limit how many E3 projects run simultaneously.'
	},
	E4: {
		label: 'E4 — Maximum',
		desc: '100% of your daily hours',
		detail: 'All-in effort — peak cognitive demand, high stakes, full immersion. Unsustainable long-term. One E4 project at a time is the hard ceiling before burnout risk spikes.'
	}
};

export class ELevelOverviewView extends EmraldWorkspaceView {
	private items: TrackedItem[] = [];
	private minutesByItem: Map<string, number> = new Map();
	private availableHours: number = 4;
	private activeFilter: string | null = null; // null = all, 'E1'|'E2'|'E3'|'E4'
	private projectContainer: Element | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: EmraldPlugin) {
		super(leaf, plugin, 'E-level overview');
	}

	getViewType(): string { return VIEW_ELEVEL_OVERVIEW; }
	getIcon(): string { return 'bar-chart-2'; }

	async onOpen() {
		const container = this.getContainer();
		this.renderHeader(container, 'E-level overview', 'Your projects by effort level', 'bar-chart-2');

		// Fetch data concurrently
		let itemsResp, sessionsResp, availResp, suggestionsResp;
		try {
			[itemsResp, sessionsResp, availResp, suggestionsResp] = await Promise.all([
				this.plugin.apiClient.getItems(),
				this.plugin.apiClient.getTodaySessions(),
				this.plugin.apiClient.getAvailability(),
				this.plugin.apiClient.getSuggestions()
			]);
		} catch {
			this.renderError(container, 'Could not load E-Level data — check your connection.');
			return;
		}

		// If items failed to load (offline, no cache), show offline message (P15 fix)
		if (itemsResp.data === null || itemsResp.data === undefined) {
			if (itemsResp.status === 0 || itemsResp.error) {
				this.renderError(container, 'Offline — project data will load when you reconnect.');
			} else {
				this.renderEmptyState(container);
			}
			return;
		}

		// Stale data banner when showing cached data offline (P15 fix)
		const anyFromCache = itemsResp.fromCache || sessionsResp.fromCache || availResp.fromCache;
		if (anyFromCache || this.isOffline()) {
			this.renderStaleBanner(container);
		}

		this.items = itemsResp.data ?? [];
		const sessions = sessionsResp.data ?? [];
		// API returns flat array: [{day_of_week, available_hours}, ...]
		// Parse the same way the sidebar does — find today's row.
		const availData = availResp.data;
		if (Array.isArray(availData) && availData.length > 0) {
			const todayDow = new Date().getDay(); // 0=Sun, 6=Sat
			const todayRow = (availData as unknown as Array<{day_of_week: number; available_hours: number}>).find((r) => r.day_of_week === todayDow);
			this.availableHours = todayRow?.available_hours ?? 4;
		} else if (availData && typeof availData === 'object' && 'effective_today' in availData) {
			// Future-proof: if API ever returns the structured Availability object
			this.availableHours = ((availData as unknown as Record<string, unknown>).effective_today as number) ?? 4;
		} else {
			this.availableHours = 4;
		}

		if (this.items.length === 0) {
			this.renderEmptyState(container);
			return;
		}

		// Calculate today's minutes per item
		this.minutesByItem = new Map();
		for (const sess of sessions) {
			if (sess.status === 'completed' && sess.duration_minutes) {
				this.minutesByItem.set(sess.item_id, (this.minutesByItem.get(sess.item_id) ?? 0) + sess.duration_minutes);
			}
		}

		const activeItems = this.items.filter(i => i.status === 'active');

		// ── E-Level Cards (interactive filters) ──
		this.renderELevelCards(container, activeItems);

		// ── Total Allocation Summary ──
		const totalAllocatedPct = activeItems.reduce((sum, i) => sum + (E_LEVEL_PCT[i.effort_level] ?? 0), 0);
		this.renderAllocationSummary(container, totalAllocatedPct, activeItems.length);

		// ── Project Table (filterable) ──
		this.projectContainer = container.createDiv({ cls: 'emerald-wv-project-table-wrap' });
		this.renderProjectTable();

		// ── Suggestions ──
		const suggestions = (suggestionsResp.data ?? []).filter(s => s.message?.trim());
		if (suggestions.length > 0) {
			this.renderSuggestions(container, suggestions);
		}

		// ── "What is effort management?" link → About EMRALD ──
		const emLink = container.createDiv({ cls: 'emerald-wv-em-link' });
		const linkEl = emLink.createEl('a', { cls: 'emerald-wv-text-link', text: 'What is effort management?' });
		const linkIcon = emLink.createSpan({ cls: 'emerald-wv-link-arrow' });
		setIcon(linkIcon, 'arrow-right');
		linkEl.addEventListener('click', (e) => {
			e.preventDefault();
			void this.plugin.openWorkspaceView(VIEW_ABOUT);
		});
	}

	// ── Empty State ─────────────────────────────────────

	private renderEmptyState(container: Element) {
		const empty = container.createDiv({ cls: 'emerald-wv-empty-state' });

		const iconEl = empty.createDiv({ cls: 'emerald-wv-empty-icon' });
		setIcon(iconEl, 'bar-chart-2');

		empty.createEl('h3', { text: 'No projects yet' });
		empty.createEl('p', {
			cls: 'emerald-wv-empty-desc',
			text: 'Add your first project from the sidebar to see your effort allocation here.'
		});
	}

	// ── E-Level Cards ───────────────────────────────────

	private renderELevelCards(container: Element, activeItems: TrackedItem[]) {
		const grid = container.createDiv({ cls: 'emerald-wv-elevel-grid' });

		for (const level of ['E1', 'E2', 'E3', 'E4']) {
			const meta = E_LEVEL_META[level];
			const itemsAtLevel = activeItems.filter(i => i.effort_level === level);
			const count = itemsAtLevel.length;

			// Today's total minutes at this level
			const todayMin = itemsAtLevel.reduce((sum, i) => sum + (this.minutesByItem.get(i.id) ?? 0), 0);
			const prescribedMin = this.availableHours * 60 * (E_LEVEL_PCT[level] / 100);
			const totalPrescribed = count * prescribedMin;

			const card = grid.createDiv({
				cls: `emerald-wv-elevel-card ${this.activeFilter === level ? 'is-active' : ''}`
			});
			card.dataset.level = level;

			// Left side: level info
			const info = card.createDiv({ cls: 'emerald-wv-elevel-info' });
			const levelLabel = info.createDiv({ cls: 'emerald-wv-elevel-label' });
			levelLabel.createSpan({ cls: 'emerald-wv-elevel-name', text: level });
			levelLabel.createSpan({ cls: 'emerald-wv-elevel-desc', text: meta.desc });

			// Expandable ⓘ info button
			const infoBtn = levelLabel.createSpan({ cls: 'emerald-wv-elevel-info-btn', attr: { 'aria-label': `About ${level}` } });
			setIcon(infoBtn, 'info');
			const detailEl = info.createDiv({ cls: 'emerald-wv-elevel-detail', text: meta.detail });
			detailEl.addClass('emrald-hidden');
			infoBtn.addEventListener('click', (e) => {
				e.stopPropagation(); // Don't trigger card filter
				const isVisible = !detailEl.hasClass('emrald-hidden');
				if (isVisible) { detailEl.addClass('emrald-hidden'); } else { detailEl.removeClass('emrald-hidden'); }
				infoBtn.toggleClass('is-expanded', !isVisible);
			});

			const countRow = info.createDiv({ cls: 'emerald-wv-elevel-count' });
			countRow.createSpan({
				cls: 'emerald-wv-elevel-count-num',
				text: String(count)
			});
			countRow.createSpan({ text: ` active project${count !== 1 ? 's' : ''}` });

			// Right side: today's progress (if any work done)
			const progress = card.createDiv({ cls: 'emerald-wv-elevel-progress' });
			if (todayMin > 0 && totalPrescribed > 0) {
				const pct = Math.min(Math.round((todayMin / totalPrescribed) * 100), 999);
				progress.createDiv({ cls: 'emerald-wv-elevel-pct', text: `${pct}%` });
				progress.createDiv({ cls: 'emerald-wv-elevel-time', text: `${this.formatDuration(todayMin)} today` });
			} else if (count > 0) {
				progress.createDiv({ cls: 'emerald-wv-elevel-time emerald-wv-elevel-no-work', text: 'No work yet' });
			}

			// Click to filter
			card.addClass('emrald-clickable');
			card.addEventListener('click', () => {
				if (this.activeFilter === level) {
					this.activeFilter = null; // Toggle off
				} else {
					this.activeFilter = level;
				}
				// Update card active states
				grid.querySelectorAll('.emerald-wv-elevel-card').forEach(c => c.removeClass('is-active'));
				if (this.activeFilter) {
					card.addClass('is-active');
				}
				this.renderProjectTable();
			});
		}
	}


	// ── Allocation Summary ──────────────────────────────

	private renderAllocationSummary(container: Element, totalPct: number, activeCount: number) {
		const section = container.createDiv({ cls: 'emerald-wv-section emerald-wv-alloc-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'pie-chart');
		headerRow.createEl('h3', { text: 'Daily allocation' });

		// Bar
		const barOuter = section.createDiv({ cls: 'emerald-wv-alloc-bar-outer' });
		const barFill = barOuter.createDiv({ cls: 'emerald-wv-alloc-bar-fill' });

		barFill.style.width = `${Math.min(totalPct, 100)}%`;
		if (totalPct > 100) barFill.addClass('is-over');
		else if (totalPct < 50) barFill.addClass('is-under');

		// Label
		const label = section.createDiv({ cls: 'emerald-wv-alloc-label' });
		if (totalPct > 100) {
			label.createSpan({
				cls: 'emerald-wv-alloc-warn',
				text: `⚠ Over-committed: ${totalPct}% across ${activeCount} project${activeCount !== 1 ? 's' : ''} (${this.availableHours}h available)`
			});
			label.createDiv({
				cls: 'emerald-wv-alloc-hint',
				text: 'Consider reducing effort levels or deactivating a project.'
			});
		} else if (totalPct < 50 && activeCount > 0) {
			label.createSpan({
				text: `${totalPct}% allocated — you have room for more projects (${this.availableHours}h available)`
			});
		} else if (activeCount === 0) {
			label.createSpan({ text: 'No active projects' });
		} else {
			label.createSpan({
				text: `${totalPct}% of ${this.availableHours}h allocated across ${activeCount} project${activeCount !== 1 ? 's' : ''}`
			});
		}
	}

	// ── Project Table ───────────────────────────────────

	private renderProjectTable() {
		if (!this.projectContainer) return;
		this.projectContainer.empty();

		const section = this.projectContainer.createDiv({ cls: 'emerald-wv-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'folder');

		const title = this.activeFilter
			? `${this.activeFilter} Projects`
			: 'All Projects';
		headerRow.createEl('h3', { text: title });

		if (this.activeFilter) {
			const clearBtn = headerRow.createEl('button', {
				cls: 'emerald-btn emerald-btn-subtle emerald-btn-sm',
				text: '✕ clear filter'
			});
			clearBtn.addEventListener('click', () => {
				this.activeFilter = null;
				this.projectContainer?.parentElement?.querySelectorAll('.emerald-wv-elevel-card').forEach(c => c.removeClass('is-active'));
				this.renderProjectTable();
			});
		}

		// Filter items
		let displayItems = this.items;
		if (this.activeFilter) {
			displayItems = this.items.filter(i => i.effort_level === this.activeFilter);
		}

		// Sort: active first, then by status, then by name
		displayItems = [...displayItems].sort((a, b) => {
			const statusOrder: Record<string, number> = { active: 0, paused: 1, completed: 2, abandoned: 3 };
			const aOrder = statusOrder[a.status] ?? 9;
			const bOrder = statusOrder[b.status] ?? 9;
			if (aOrder !== bOrder) return aOrder - bOrder;
			return a.name.localeCompare(b.name);
		});

		if (displayItems.length === 0) {
			this.renderPlaceholder(section, this.activeFilter ? `No ${this.activeFilter} projects.` : 'No projects yet.');
			return;
		}

		const table = section.createEl('table', { cls: 'emerald-wv-table' });
		const thead = table.createEl('thead');
		const thRow = thead.createEl('tr');
		for (const h of ['', 'Name', 'E-Level', 'Today', 'Prescribed', 'Progress']) {
			thRow.createEl('th', { text: h });
		}

		const tbody = table.createEl('tbody');
		for (const item of displayItems) {
			const row = tbody.createEl('tr');
			if (item.status !== 'active') row.addClass('emerald-wv-row-inactive');

			// Status dot
			const dotCell = row.createEl('td');
			const dot = dotCell.createSpan({ cls: 'emerald-phase-dot' });
			dot.dataset.status = item.status ?? 'unknown';

			// Name (clickable → opens note in Obsidian)
			const nameCell = row.createEl('td');
			const nameEl = nameCell.createSpan({
				cls: 'emerald-wv-project-name emerald-wv-project-link',
				text: item.name
			});
			nameEl.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openNote(item);
			});
			if (item.status !== 'active') {
				nameCell.createSpan({
					cls: 'emerald-wv-project-status',
					text: ` (${item.status})`
				});
			}

			// E-Level (colored)
			const levelCell = row.createEl('td');
			const levelBadge = levelCell.createSpan({ cls: 'emerald-wv-level-badge', text: item.effort_level });
			levelBadge.dataset.level = item.effort_level ?? '';

			// Today's time
			const todayMin = this.minutesByItem.get(item.id) ?? 0;
			row.createEl('td', { text: todayMin > 0 ? this.formatDuration(todayMin) : '—' });

			// Prescribed time (active only — inactive/completed don't contribute to daily allocation)
			const pct = E_LEVEL_PCT[item.effort_level] ?? 50;
			const prescribedMin = (this.availableHours * 60 * pct) / 100;
			row.createEl('td', { text: item.status === 'active' ? this.formatDuration(prescribedMin) : '—' });

			// Progress bar
			const progressCell = row.createEl('td');
			if (item.status === 'active') {
				const pctComplete = prescribedMin > 0 ? Math.min(Math.round((todayMin / prescribedMin) * 100), 999) : 0;
				const barOuter = progressCell.createDiv({ cls: 'emerald-wv-pct-bar' });
				const barFill = barOuter.createDiv({ cls: 'emerald-wv-pct-fill' });
				barFill.style.width = `${Math.min(pctComplete, 100)}%`;
				if (pctComplete >= 100) barFill.addClass('is-complete');
				barOuter.createSpan({ cls: 'emerald-wv-pct-text', text: `${pctComplete}%` });
			} else {
				progressCell.createSpan({ cls: 'emerald-wv-empty', text: '—' });
			}
		}
	}

	// ── Suggestions ─────────────────────────────────────

	// ── Open Note ────────────────────────────────────────

	private openNote(item: TrackedItem) {
		if (item.obsidian_note_path) {
			const file = this.plugin.app.vault.getAbstractFileByPath(item.obsidian_note_path);
			if (file instanceof TFile) {
				void this.plugin.app.workspace.getLeaf(false).openFile(file);
			} else {
				new Notice(`Note not found: ${item.obsidian_note_path}`);
			}
		} else {
			new Notice(`No linked note for "${item.name}"`);
		}
	}

	private renderSuggestions(container: Element, suggestions: Array<{ message: string; type: string }>) {
		const section = container.createDiv({ cls: 'emerald-wv-section' });

		const headerRow = section.createDiv({ cls: 'emerald-wv-section-header-row' });
		const iconEl = headerRow.createSpan({ cls: 'emerald-wv-section-icon' });
		setIcon(iconEl, 'message-circle');
		headerRow.createEl('h3', { text: 'Suggestions' });

		for (const sug of suggestions) {
			const card = section.createDiv({ cls: 'emerald-wv-suggestion-card' });

			const sugIcon = card.createSpan({ cls: 'emerald-wv-suggestion-icon' });
			setIcon(sugIcon, sug.type === 'effort_adjustment' ? 'sliders' : 'lightbulb');

			card.createSpan({ text: sug.message });
		}
	}
}
