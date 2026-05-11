// EMRALD Folder Sync
// Watches Active/Inactive folders for file changes and syncs with EMRALD API.
// File creation → create tracked item + initialize frontmatter
// File move (Active→Inactive) → pause item
// File move (Inactive→Active) → reactivate item
// Frontmatter edit → sync E-level changes to API

import { App, TFile, TFolder, TAbstractFile, Notice, EventRef } from 'obsidian';
import { EmraldAPIClient, TrackedItem } from '../api/client';
import {
	readEmraldFrontmatter,
	writeEmraldFrontmatter,
	initializeEmraldFrontmatter,
	isEmraldNote,
	getEmraldId,
	getEffortLevel
} from './frontmatter';

export interface FolderSyncConfig {
	activeFolderPath: string;
	inactiveFolderPath: string;
}

export class FolderSync {
	private app: App;
	private apiClient: EmraldAPIClient;
	private config: FolderSyncConfig;
	private eventRefs: EventRef[] = [];
	private syncInProgress: boolean = false;
	private localItemCache: Map<string, TrackedItem> = new Map(); // emrald-id → item

	constructor(app: App, apiClient: EmraldAPIClient, config: FolderSyncConfig) {
		this.app = app;
		this.apiClient = apiClient;
		this.config = config;
	}

	/**
	 * Start watching folders for changes.
	 */
	start() {
		// Watch for file creation in Active folder
		const createRef = this.app.vault.on('create', (file: TAbstractFile) => {
			if (file instanceof TFile && file.extension === 'md') {
				void this.handleFileCreate(file);
			}
		});
		this.eventRefs.push(createRef);

		// Watch for file rename/move
		const renameRef = this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			if (file instanceof TFile && file.extension === 'md') {
				void this.handleFileMove(file, oldPath);
			}
		});
		this.eventRefs.push(renameRef);

		// Watch for frontmatter changes (metadata cache update)
		const metaRef = this.app.metadataCache.on('changed', (file: TFile) => {
			if (file.extension === 'md') {
				void this.handleMetadataChange(file);
			}
		});
		this.eventRefs.push(metaRef);
	}

	/**
	 * Stop watching and clean up event listeners.
	 */
	stop() {
		for (const ref of this.eventRefs) {
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];
	}

	/**
	 * Update config (e.g., when settings change).
	 */
	updateConfig(config: FolderSyncConfig) {
		this.config = config;
	}

	/**
	 * Full sync: Pull all items from API and reconcile with vault files.
	 * Run on plugin load and periodically (every 5 minutes).
	 */
	async fullSync(): Promise<void> {
		if (this.syncInProgress) return;
		this.syncInProgress = true;

		try {
			// Fetch all items from API
			const response = await this.apiClient.getItems();
			if (response.error || !response.data) {
				console.warn('Emrald: Full sync failed —', response.error);
				return;
			}

			const apiItems = response.data;

			// Index by ID for quick lookup
			this.localItemCache.clear();
			for (const item of apiItems) {
				this.localItemCache.set(item.id, item);
			}

			// Find all markdown files in Active/Inactive folders
			const activeFolder = this.app.vault.getAbstractFileByPath(this.config.activeFolderPath);
			const inactiveFolder = this.app.vault.getAbstractFileByPath(this.config.inactiveFolderPath);

			const activeFiles = activeFolder instanceof TFolder
				? this.getMarkdownFiles(activeFolder)
				: [];
			const inactiveFiles = inactiveFolder instanceof TFolder
				? this.getMarkdownFiles(inactiveFolder)
				: [];

			// Sync each tracked file's frontmatter with API data
			for (const file of [...activeFiles, ...inactiveFiles]) {
				await this.syncFileWithAPI(file, apiItems);
			}
		} finally {
			this.syncInProgress = false;
		}
	}

	/**
	 * Get all items from local cache (populated by fullSync).
	 */
	getItems(): TrackedItem[] {
		return Array.from(this.localItemCache.values());
	}

	/**
	 * Get a specific item by EMRALD ID.
	 */
	getItem(emeraldId: string): TrackedItem | undefined {
		return this.localItemCache.get(emeraldId);
	}

	// ── Private Methods ─────────────────────────────────────

	private getMarkdownFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			} else if (child instanceof TFolder) {
				// Recursive: support nested folders
				files.push(...this.getMarkdownFiles(child));
			}
		}
		return files;
	}

	private isInActiveFolder(path: string): boolean {
		return path.startsWith(this.config.activeFolderPath + '/');
	}

	private isInInactiveFolder(path: string): boolean {
		return path.startsWith(this.config.inactiveFolderPath + '/');
	}

	private isInWatchedFolder(path: string): boolean {
		return this.isInActiveFolder(path) || this.isInInactiveFolder(path);
	}

	/**
	 * Handle new file creation in a watched folder.
	 */
	private async handleFileCreate(file: TFile): Promise<void> {
		if (!this.isInWatchedFolder(file.path)) return;
		if (isEmraldNote(this.app, file)) return; // Already tracked

		// Only auto-prompt for Active folder
		if (!this.isInActiveFolder(file.path)) return;

		// Wait a moment for the file to be fully written
		await sleep(500);

		// Check again after delay (file might have been created with frontmatter)
		if (isEmraldNote(this.app, file)) return;

		// Prompt user to track this note
		new Notice(`New note in Active folder: "${file.basename}". Open emrald sidebar to track it.`);
	}

	/**
	 * Handle file rename/move between folders.
	 */
	private async handleFileMove(file: TFile, oldPath: string): Promise<void> {
		if (!isEmraldNote(this.app, file)) return;

		const emeraldId = getEmraldId(this.app, file);
		if (!emeraldId) return;

		const wasActive = oldPath.startsWith(this.config.activeFolderPath + '/');
		const wasInactive = oldPath.startsWith(this.config.inactiveFolderPath + '/');
		const nowActive = this.isInActiveFolder(file.path);
		const nowInactive = this.isInInactiveFolder(file.path);

		// Active → Inactive: pause the item
		if (wasActive && nowInactive) {
			const response = await this.apiClient.updateItem(emeraldId, { status: 'paused' });
			if (!response.error) {
				await writeEmraldFrontmatter(this.app, file, { 'status': 'paused' });
				new Notice(`"${file.basename}" paused.`);
			}
		}

		// Inactive → Active: reactivate the item
		if (wasInactive && nowActive) {
			const response = await this.apiClient.updateItem(emeraldId, { status: 'active' });
			if (!response.error) {
				await writeEmraldFrontmatter(this.app, file, { 'status': 'active' });
				new Notice(`"${file.basename}" reactivated.`);
			}
		}

		// Note path is tracked locally via frontmatter, not sent to API
	}

	/**
	 * Handle frontmatter metadata change — sync effort-level edits to API.
	 */
	private async handleMetadataChange(file: TFile): Promise<void> {
		if (!this.isInWatchedFolder(file.path)) return;
		if (!isEmraldNote(this.app, file)) return;

		const emeraldId = getEmraldId(this.app, file);
		if (!emeraldId) return;

		const cachedItem = this.localItemCache.get(emeraldId);
		if (!cachedItem) return;

		// Check if effort-level changed
		const currentLevel = getEffortLevel(this.app, file);
		if (currentLevel && currentLevel !== cachedItem.effort_level) {
			const response = await this.apiClient.updateItem(emeraldId, {
				effort_level: currentLevel
			});

			if (!response.error && response.data) {
				this.localItemCache.set(emeraldId, response.data);
				new Notice(`E-level updated: ${file.basename} → ${currentLevel}`);
			}
		}
	}

	/**
	 * Sync a single file's frontmatter with API data.
	 * API is source of truth for computed fields (sessions, total-minutes).
	 */
	private async syncFileWithAPI(file: TFile, apiItems: TrackedItem[]): Promise<void> {
		const emeraldId = getEmraldId(this.app, file);
		if (!emeraldId) return;

		const apiItem = apiItems.find(item => item.id === emeraldId);
		if (!apiItem) return; // Item deleted on server?

		// Update frontmatter from API (computed fields)
		const fm = readEmraldFrontmatter(this.app, file);
		if (!fm) return;

		const updates: Record<string, unknown> = {};

		// Sync status
		if (fm['status'] !== apiItem.status) {
			updates['status'] = apiItem.status;
		}

		// Sync effort-level (API → frontmatter only if user hasn't changed it locally)
		if (fm['effort-level'] !== apiItem.effort_level) {
			updates['effort-level'] = apiItem.effort_level;
		}

		if (Object.keys(updates).length > 0) {
			await writeEmraldFrontmatter(this.app, file, updates);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => activeWindow.setTimeout(resolve, ms));
}
