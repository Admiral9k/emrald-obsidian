// EMRALD Projects Component
// Renders the project list with active/inactive sections, context menus,
// and session start integration.

import { Menu, Notice, setIcon, TFile } from 'obsidian';
import EmraldPlugin from '../../main';
import { TrackedItem, Label } from '../api/client';


// E-level prescribed duration as percentage of daily available hours
const E_LEVEL_PERCENT: Record<string, number> = {
	E1: 0.25,
	E2: 0.50,
	E3: 0.75,
	E4: 1.00
};

// E-level colors for inline badge styling
const E_LEVEL_COLORS: Record<string, string> = {
	E1: '#2D7A4A',
	E2: '#B8912E',
	E3: '#C06A30',
	E4: '#B54545'
};

export interface ProjectsState {
	items: TrackedItem[];
	activeSessionItemId: string | null;
	todayMinutesByItem: Map<string, number>;  // item_id → minutes worked today
	activeSessionElapsedMin: number;          // live elapsed minutes for active session
	availableHours: number;                   // today's available hours (for prescribed calc)
}

export class ProjectsComponent {
	private plugin: EmraldPlugin;
	private containerEl: HTMLElement;
	state: ProjectsState;

	constructor(plugin: EmraldPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.state = {
			items: [],
			activeSessionItemId: null,
			todayMinutesByItem: new Map(),
			activeSessionElapsedMin: 0,
			availableHours: 4
		};
	}

	/**
	 * Render the full projects section.
	 */
	render() {
		this.containerEl.empty();
		this.containerEl.addClass('emerald-projects-content');

		const activeItems = this.state.items.filter(i => i.status === 'active');
		const inactiveItems = this.state.items.filter(i => i.status === 'paused');

		// Completed projects: hide after 30 days (auto-archive from sidebar)
		const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
		const completedItems = this.state.items.filter(i =>
			i.status === 'completed' &&
			(!i.updated_at || new Date(i.updated_at).getTime() > thirtyDaysAgo)
		);

		// Active projects
		this.renderActiveProjects(activeItems);

		// Divider with count
		const divider = this.containerEl.createDiv({ cls: 'emerald-projects-divider' });
		divider.createSpan({ text: `Active: ${activeItems.length}/5` });

		// Inactive accordion
		this.renderCollapsibleSection('Inactive', inactiveItems, 'paused');

		// Completed accordion
		this.renderCollapsibleSection('Completed', completedItems, 'completed');
	}

	/**
	 * Update state and re-render.
	 */
	updateState(partial: Partial<ProjectsState>) {
		// P19 fix: if only todayMinutesByItem changed and we have an active session,
		// update the non-active project time labels in-place instead of full re-render.
		// Full re-render destroys the active session progress element, causing a
		// visual jump until the next tick restores it.
		if ('todayMinutesByItem' in partial && Object.keys(partial).length === 1
			&& this.state.activeSessionItemId) {
			this.state.todayMinutesByItem = partial.todayMinutesByItem!;
			// Update non-active project time labels in-place
			const timeEls = this.containerEl.querySelectorAll('.emerald-project-time:not(.emerald-in-session-progress)');
			timeEls.forEach((el: Element) => {
				const card = el.closest('.emerald-project-card');
				if (!card) return;
				const itemId = (card as HTMLElement).dataset?.itemId;
				if (!itemId) return;
				const min = this.state.todayMinutesByItem.get(itemId) ?? 0;
				const timeStr = min > 0
					? `${Math.floor(min / 60)}h ${Math.round(min % 60)}m today`
					: '0m today';
				(el as HTMLElement).textContent = timeStr;
			});
			return;
		}
		Object.assign(this.state, partial);
		this.render();
	}

	// ── Active Projects ─────────────────────────────────────

	private renderActiveProjects(items: TrackedItem[]) {
		for (const item of items) {
			this.renderProjectCard(item, true);
		}

		if (items.length === 0) {
			this.containerEl.createDiv({
				cls: 'emerald-projects-empty',
				text: 'No active projects. Add one to get started.'
			});
		}
	}

	private renderProjectCard(item: TrackedItem, _isActive: boolean) {
		const isInSession = this.state.activeSessionItemId === item.id;
		const todayMin = this.state.todayMinutesByItem.get(item.id) ?? 0;

		const card = this.containerEl.createDiv({
			cls: `emerald-project-card ${isInSession ? 'is-in-session' : ''}`
		});
		card.dataset.itemId = item.id;
		card.setAttribute('role', 'button');
		card.setAttribute('tabindex', '0');
		card.setAttribute('aria-label', `${item.name}, ${item.effort_level}${isInSession ? ', in session' : ''}. Press Enter for options.`);

		// Top row: name + E-level badge
		const topRow = card.createDiv({ cls: 'emerald-project-top' });

		// Project name — opens note, stops propagation so card context menu doesn't fire
		const nameEl = topRow.createSpan({
			cls: 'emerald-project-name',
			text: item.name,
			attr: { 'aria-label': `Open ${item.name} note` }
		});
		nameEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openNote(item);
		});

		// E-level badge
		const badge = topRow.createSpan({
			cls: 'emerald-elevel-badge',
			text: item.effort_level,
			attr: { 'aria-label': `Effort level ${item.effort_level}` }
		});
		badge.dataset.level = item.effort_level ?? '';
		badge.style.color = E_LEVEL_COLORS[item.effort_level] ?? 'var(--text-muted)';

		// Area chip (Option B, S100) — the single area-label this project is filed under, if any.
		const area = this.areaOf(item);
		if (area) {
			const chip = topRow.createSpan({
				cls: 'emrald-area-chip',
				text: area.name,
				attr: { 'aria-label': `Area: ${area.name}` }
			});
			if (area.color) chip.style.borderColor = area.color;
		}

		// Bottom row: today's time
		const bottomRow = card.createDiv({ cls: 'emerald-project-bottom' });

		if (isInSession) {
			// In-session state with live elapsed / prescribed time
			bottomRow.createSpan({ cls: 'emerald-in-session-label', text: '┄┄ In session ┄┄' });
			const progressEl = bottomRow.createSpan({ cls: 'emerald-in-session-progress emerald-project-time' });
			progressEl.dataset.itemId = item.id;
			this.updateSessionProgressEl(progressEl, item);
		} else {
			const timeStr = todayMin > 0
				? `${Math.floor(todayMin / 60)}h ${Math.round(todayMin % 60)}m today`
				: '0m today';
			bottomRow.createSpan({ cls: 'emerald-project-time', text: timeStr });
		}

		// Whole card opens context menu on click (except name which opens note)
		card.addClass('emrald-clickable');
		card.addEventListener('click', (e) => {
			// Don't trigger if they clicked the project name (that opens the note)
			if ((e.target as HTMLElement).closest('.emerald-project-name')) return;
			this.showContextMenu(e, item, isInSession);
		});
		card.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				// Name already handled via click stopPropagation, card gets context menu
				this.showContextMenu(e, item, isInSession);
			}
		});
	}

	// ── Collapsible Section (Inactive / Completed) ─────────

	private renderCollapsibleSection(label: string, items: TrackedItem[], sectionStatus: 'paused' | 'completed') {
		if (items.length === 0) return;

		const accordion = this.containerEl.createDiv({ cls: 'emerald-inactive-accordion' });

		const header = accordion.createDiv({ cls: 'emerald-inactive-header' });
		header.setAttribute('role', 'button');
		header.setAttribute('aria-expanded', 'false');
		header.setAttribute('aria-label', `${label} section (click to expand)`);
		header.tabIndex = 0;
		header.createSpan({ text: `▸ ${label} (${items.length})` });

		// Clear button for Completed section — matches "+Add" style
		if (sectionStatus === 'completed') {
			const clearBtn = header.createSpan({
				cls: 'emerald-section-action emerald-clear-action',
				text: 'Clear'
			});
			clearBtn.setAttribute('role', 'button');
			clearBtn.setAttribute('aria-label', 'Clear completed projects');
			clearBtn.tabIndex = 0;
			clearBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const menu = new Menu();
				menu.addItem(i => i.setTitle('Confirm clear').setIcon('trash-2').onClick(() => {
					void this.clearCompletedProjects(items);
				}));
				menu.showAtMouseEvent(e);
			});
		}

		const content = accordion.createDiv({ cls: 'emerald-inactive-content' });
		content.addClass('emrald-hidden');

		const toggle = () => {
			const isHidden = content.hasClass('emrald-hidden');
			if (isHidden) { content.removeClass('emrald-hidden'); } else { content.addClass('emrald-hidden'); }
			header.setAttribute('aria-expanded', String(isHidden));
			// Update only the label span, preserve Clear button
			const labelSpan = header.querySelector('span');
			if (labelSpan) labelSpan.textContent = `${isHidden ? '▼' : '▸'} ${label} (${items.length})`;
		};

		header.addEventListener('click', toggle);
		header.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		});

		for (const item of items) {
			const row = content.createDiv({ cls: 'emerald-inactive-item' });
			row.setAttribute('role', 'button');
			row.setAttribute('aria-label', `${item.name} — ${item.effort_level}`);
			row.tabIndex = 0;
			const iconEl = row.createSpan({ cls: 'emerald-inactive-icon' });
			iconEl.setAttribute('aria-hidden', 'true');
			if (sectionStatus === 'completed') {
				setIcon(iconEl, 'check-circle-2');
			} else {
				setIcon(iconEl, 'circle-dot');
			}
			const nameEl = row.createSpan({ text: item.name });
			nameEl.setAttribute('aria-hidden', 'true');
			const badge = row.createSpan({ cls: 'emerald-elevel-badge-small', text: item.effort_level });
			badge.dataset.level = item.effort_level ?? '';
			badge.style.color = E_LEVEL_COLORS[item.effort_level] ?? 'var(--text-muted)';

			row.addClass('emrald-clickable');
			row.addEventListener('click', (e) => {
				this.showCollapsibleContextMenu(e, item, sectionStatus);
			});
			row.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.showCollapsibleContextMenu(e, item, sectionStatus);
				}
			});
		}
	}

	// ── Context Menus ───────────────────────────────────────

	private showCollapsibleContextMenu(e: Event, item: TrackedItem, sectionStatus: 'paused' | 'completed') {
		const menu = new Menu();

		menu.addItem(i => i.setTitle('Set active').setIcon('play-circle').onClick(() => this.reactivateItem(item)));

		if (sectionStatus === 'paused') {
			menu.addItem(i => i.setTitle('Mark complete').setIcon('check-circle').onClick(() => this.setItemStatus(item, 'completed')));
		} else {
			menu.addItem(i => i.setTitle('Set inactive').setIcon('arrow-down').onClick(() => this.setItemStatus(item, 'paused')));
		}

		menu.addItem(i => i.setTitle('Open note').setIcon('file-text').onClick(() => this.openNote(item)));
		menu.addItem(i => i.setTitle('Set area').setIcon('tag').onClick(() => { void this.onSetArea(item); }));
		this.addEffortProfileMenuItems(menu, item);

		menu.showAtMouseEvent(e as MouseEvent);
	}

	private showContextMenu(e: Event, item: TrackedItem, isInSession: boolean) {
		const menu = new Menu();

		if (isInSession) {
			// In-session menu
			menu.addItem(i => i.setTitle('Pause').setIcon('pause').onClick(() => this.onPauseSession()));
			menu.addItem(i => i.setTitle('Stop').setIcon('square').onClick(() => this.onStopSession()));
			menu.addSeparator();
			menu.addItem(i => i.setTitle('Open note').setIcon('file-text').onClick(() => this.openNote(item)));
			menu.addItem(i => i.setTitle('Set area').setIcon('tag').onClick(() => { void this.onSetArea(item); }));
			this.addEffortProfileMenuItems(menu, item);
		} else if (this.state.activeSessionItemId) {
			// Another session is active — show management options too
			menu.addItem(i => i.setTitle('Open note').setIcon('file-text').onClick(() => this.openNote(item)));
			menu.addItem(i => i.setTitle('Change e-level').setIcon('pencil').onClick(() => this.onChangeELevel(item)));
			menu.addItem(i => i.setTitle('Set area').setIcon('tag').onClick(() => { void this.onSetArea(item); }));
			this.addEffortProfileMenuItems(menu, item);
			menu.addSeparator();
			menu.addItem(i => i.setTitle('Set inactive').setIcon('arrow-down').onClick(() => this.setItemStatus(item, 'paused')));
			menu.addItem(i => i.setTitle('Mark complete').setIcon('check-circle').onClick(() => this.setItemStatus(item, 'completed')));
		} else {
			// No active session — full menu
			menu.addItem(i => i.setTitle('Start session').setIcon('play').onClick(() => this.onStartSession(item)));
			menu.addSeparator();
			menu.addItem(i => i.setTitle('Open note').setIcon('file-text').onClick(() => this.openNote(item)));
			menu.addItem(i => i.setTitle('Change e-level').setIcon('pencil').onClick(() => this.onChangeELevel(item)));
			menu.addItem(i => i.setTitle('Set area').setIcon('tag').onClick(() => { void this.onSetArea(item); }));
			this.addEffortProfileMenuItems(menu, item);
			menu.addItem(i => i.setTitle('Set inactive').setIcon('arrow-down').onClick(() => this.setItemStatus(item, 'paused')));
			menu.addItem(i => i.setTitle('Mark complete').setIcon('check-circle').onClick(() => this.setItemStatus(item, 'completed')));
		}

		menu.showAtMouseEvent(e as MouseEvent);
	}

	// SEQ-3 (mig 012). Adds "Toggle multi-day" — the design gateway (§4) — and,
	// when the project is multi-day, "Edit effort profile" to open the prediction
	// capture form. Kept behind the multi_day toggle so the form only appears for
	// projects big enough to justify the effort of filling it out.
	private addEffortProfileMenuItems(menu: Menu, item: TrackedItem) {
		const isMultiDay = item.multi_day === true;
		menu.addItem(i => i
			.setTitle(isMultiDay ? 'Unmark multi-day' : 'Mark multi-day')
			.setIcon(isMultiDay ? 'calendar-x' : 'calendar-days')
			.onClick(() => { void this.toggleMultiDay(item); })
		);
		if (isMultiDay) {
			menu.addItem(i => i
				.setTitle('Edit effort profile')
				.setIcon('sliders-horizontal')
				.onClick(() => { void this.openEffortProfileModal(item); })
			);
			// SEQ-6 Block 2: forecast lives on the readied-active project (design placement).
			// Gated on multi_day because the anchors (B1/B2) come from the effort profile,
			// which is only offered once a project is marked multi-day. Active-only: forecast
			// is decision-support for a project you're about to work on.
			if (item.status === 'active') {
				menu.addItem(i => i
					.setTitle('Effort forecast')
					.setIcon('trending-up')
					.onClick(() => { void this.openEffortForecastModal(item); })
				);
			}
		}
	}

	private async toggleMultiDay(item: TrackedItem) {
		const next = !(item.multi_day === true);
		const idx = this.state.items.findIndex(i => i.id === item.id);
		if (idx >= 0) {
			this.state.items[idx] = { ...this.state.items[idx], multi_day: next };
			this.render();
		}

		const resp = await this.plugin.apiClient.updateItem(item.id, { multi_day: next });
		if (resp.error && !resp.queued) {
			if (idx >= 0) {
				this.state.items[idx] = { ...this.state.items[idx], multi_day: item.multi_day };
				this.render();
			}
			new Notice(`Couldn’t update “${item.name}”: ${resp.error}`);
			return;
		}

		if (resp.data && idx >= 0) {
			this.state.items[idx] = resp.data;
			this.render();
		}

		if (next) {
			new Notice(`“${item.name}” marked multi-day. You can now capture an effort profile.`);
		} else {
			new Notice(`“${item.name}” is no longer multi-day.`);
		}
	}

	private async openEffortProfileModal(item: TrackedItem) {
		const { EffortProfileModal } = await import('../modals/effort-profile');
		const existingResp = await this.plugin.apiClient.getEffortProfile(item.id);
		const existing = existingResp.data ?? null;
		const modal = new EffortProfileModal(
			this.plugin.app,
			this.plugin,
			item,
			existing,
			() => { /* saved — no local state refresh needed */ }
		);
		modal.open();
	}

	// SEQ-6 Block 2: open the read-only forecast modal for a readied-active project.
	// Anchors are read from the project's current effort profile inside the modal.
	private async openEffortForecastModal(item: TrackedItem) {
		const { EffortForecastModal } = await import('../modals/effort-forecast');
		const modal = new EffortForecastModal(this.plugin.app, this.plugin, item);
		modal.open();
	}

	// ── Area (single-select, Option B, S100) ────────────────
	// Area/category is represented via the generic label/item_label tables, but the UI treats it as
	// ONE area-label per project (convention, not a DB constraint). areaOf() returns the project's
	// current area = its first attached label (embedded on GET /v1/items).
	private areaOf(item: TrackedItem): Label | null {
		const labels = item.labels;
		if (Array.isArray(labels) && labels.length > 0) return labels[0];
		return null;
	}

	// Open the area picker; on choice, set/clear the single area-label (detach old, attach new).
	private async onSetArea(item: TrackedItem) {
		const { AreaPickerModal } = await import('../modals/area-picker');
		const labelsResp = await this.plugin.apiClient.getLabels();
		if (labelsResp.error) {
			new Notice(`Couldn’t load areas: ${labelsResp.error}`);
			return;
		}
		const allLabels = labelsResp.data ?? [];
		const current = this.areaOf(item);

		const modal = new AreaPickerModal(
			this.plugin.app,
			allLabels,
			current?.id ?? null,
			(choice) => {
				if (choice.kind === 'clear') {
					void this.applyArea(item, null, null);
				} else if (choice.kind === 'label') {
					void this.applyArea(item, choice.label, null);
				} else {
					void this.applyArea(item, null, choice.name);
				}
			},
		);
		modal.open();
	}

	// Set the project's single area. Detaches the current area-label (if any), then attaches the
	// chosen one — creating the label first if the user typed a new name. null label + null name = clear.
	private async applyArea(item: TrackedItem, label: Label | null, newName: string | null) {
		const idx = this.state.items.findIndex(i => i.id === item.id);
		const current = this.areaOf(item);

		// Resolve the target label: use the chosen one, or create it from the typed name.
		let target = label;
		if (!target && newName) {
			const created = await this.plugin.apiClient.createLabel(newName);
			if (created.error || !created.data) {
				new Notice(`Couldn’t create area “${newName}”: ${created.error ?? 'unknown error'}`);
				return;
			}
			target = created.data;
		}

		// No-op if choosing the area already set.
		if (target && current && target.id === current.id) return;

		// Optimistic update: reflect the new area (or cleared) locally.
		if (idx >= 0) {
			this.state.items[idx] = { ...this.state.items[idx], labels: target ? [target] : [] };
			this.render();
		}

		// Detach the previous area-label first (single-select convention).
		if (current) {
			const det = await this.plugin.apiClient.detachLabel(item.id, current.id);
			if (det.error && !det.queued) {
				// Revert on hard failure.
				if (idx >= 0) { this.state.items[idx] = { ...this.state.items[idx], labels: current ? [current] : [] }; this.render(); }
				new Notice(`Couldn’t update area: ${det.error}`);
				return;
			}
		}

		// Attach the new one (unless clearing).
		if (target) {
			const att = await this.plugin.apiClient.attachLabel(item.id, target.id);
			if (att.error && !att.queued) {
				if (idx >= 0) { this.state.items[idx] = { ...this.state.items[idx], labels: current ? [current] : [] }; this.render(); }
				new Notice(`Couldn’t set area: ${att.error}`);
				return;
			}
			new Notice(`“${item.name}” filed under “${target.name}”.`);
		} else {
			new Notice(`Area cleared for “${item.name}”.`);
		}
	}

	// ── Actions ─────────────────────────────────────────────

	private openNote(item: TrackedItem) {
		if (item.obsidian_note_path) {
			const file = this.plugin.app.vault.getAbstractFileByPath(item.obsidian_note_path);
			if (file instanceof TFile) {
				void this.plugin.app.workspace.getLeaf(false).openFile(file);
			} else {
				new Notice(`Note not found: "${item.obsidian_note_path}" — it may have been moved or deleted.`);
			}
		} else {
			new Notice(`No linked note for "${item.name}"`);
		}
	}

	private async setItemStatus(item: TrackedItem, status: 'paused' | 'completed' | 'abandoned') {
		// Optimistically update local state so the UI reflects the change
		// immediately, even if the API call is queued offline (P14 fix).
		const idx = this.state.items.findIndex(i => i.id === item.id);
		if (idx >= 0) {
			this.state.items[idx] = { ...this.state.items[idx], status };
			this.render();
		}

		const resp = await this.plugin.apiClient.updateItem(item.id, { status });
		if (resp.error && !resp.queued) {
			// Revert optimistic update on real error (not queued)
			if (idx >= 0) {
				this.state.items[idx] = { ...this.state.items[idx], status: item.status };
				this.render();
			}
			new Notice(`Failed to update "${item.name}": ${resp.error}`);
			return;
		}

		if (resp.data) {
			// Server confirmed — use authoritative data
			if (idx >= 0) {
				this.state.items[idx] = resp.data;
				this.render();
			}
		}

		new Notice(resp.queued
			? `"${item.name}" → ${status} (will sync when online)`
			: `"${item.name}" → ${status}`);
	}

	private async reactivateItem(item: TrackedItem) {
		const activeCount = this.state.items.filter(i => i.status === 'active').length;
		if (activeCount >= 5) {
			new Notice('Maximum 5 active projects. Deactivate one first.');
			return;
		}

		// Optimistically update local state (P14 fix)
		const idx = this.state.items.findIndex(i => i.id === item.id);
		if (idx >= 0) {
			this.state.items[idx] = { ...this.state.items[idx], status: 'active' };
			this.render();
		}

		const resp = await this.plugin.apiClient.updateItem(item.id, { status: 'active' });
		if (resp.error && !resp.queued) {
			// Revert on real error
			if (idx >= 0) {
				this.state.items[idx] = { ...this.state.items[idx], status: item.status };
				this.render();
			}
			new Notice(`Failed to reactivate "${item.name}": ${resp.error}`);
			return;
		}

		if (resp.data) {
			if (idx >= 0) {
				this.state.items[idx] = resp.data;
				this.render();
			}
		}

		new Notice(resp.queued
			? `"${item.name}" reactivated (will sync when online)`
			: `"${item.name}" reactivated.`);
	}

	// ── Session Progress (live update without full re-render) ────

	/**
	 * Called every second by the sidebar during an active session.
	 * Updates only the in-session progress text — no full re-render.
	 */
	updateSessionProgress(elapsedMin: number) {
		this.state.activeSessionElapsedMin = elapsedMin;

		// Find the in-session progress element and update it
		const progressEl = this.containerEl.querySelector<HTMLElement>('.emerald-in-session-progress');
		if (!progressEl) return;

		const itemId = progressEl.dataset.itemId;
		if (!itemId) return;

		const item = this.state.items.find(i => i.id === itemId);
		if (!item) return;

		this.updateSessionProgressEl(progressEl, item);
	}

	/**
	 * Render the elapsed/prescribed text into a progress element.
	 */
	private updateSessionProgressEl(el: HTMLElement, item: TrackedItem) {
		const priorMin = this.state.todayMinutesByItem.get(item.id) ?? 0;
		const totalMin = priorMin + this.state.activeSessionElapsedMin;

		const prescribedPct = E_LEVEL_PERCENT[item.effort_level] ?? 0.5;
		const prescribedMin = this.state.availableHours * 60 * prescribedPct;

		// Use Math.floor for both to prevent oscillation between two values each second
		const fmt = (min: number): string => {
			const h = Math.floor(min / 60);
			const m = Math.floor(min % 60);
			return h > 0 ? `${h}h ${m}m` : `${m}m`;
		};

		el.textContent = `${fmt(totalMin)} / ${fmt(prescribedMin)}`;
	}

	// ── Clear Completed Projects ────────────────────────────

	async clearCompletedProjects(items: TrackedItem[]) {
		let cleared = 0;
		for (const item of items) {
			const idx = this.state.items.findIndex(i => i.id === item.id);
			if (idx >= 0) {
				this.state.items[idx] = { ...this.state.items[idx], status: 'abandoned' };
			}
			const resp = await this.plugin.apiClient.updateItem(item.id, { status: 'abandoned' });
			if (resp.error && !resp.queued) {
				// Revert on failure
				if (idx >= 0) {
					this.state.items[idx] = { ...this.state.items[idx], status: 'completed' };
				}
			} else {
				cleared++;
			}
		}
		this.render();
		new Notice(cleared > 0
			? `Cleared ${cleared} completed project${cleared > 1 ? 's' : ''}`
			: 'Failed to clear projects');
	}

	// ── Event Handlers (wired by sidebar view) ──────────────

	onStartSession: (item: TrackedItem) => void = () => {};
	onPauseSession: () => void = () => {};
	onStopSession: () => void = () => {};
	onChangeELevel: (item: TrackedItem) => void = () => {};
}
