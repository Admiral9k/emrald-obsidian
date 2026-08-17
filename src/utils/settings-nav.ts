// Settings navigation helper.
//
// `app.setting` is an undocumented internal (it is NOT in obsidian.d.ts), so
// every access goes through a guarded cast and optional calls — if Obsidian
// ever changes it, the click becomes a no-op instead of throwing. Precedent:
// src/views/workspace/digest.ts already opens the tab this way.

import type { Plugin } from 'obsidian';

interface SettingHost {
	open?: () => void;
	openTabById?: (id: string) => unknown;
}

function settingHost(plugin: Plugin): SettingHost | undefined {
	return (plugin.app as unknown as Record<string, unknown>).setting as SettingHost | undefined;
}

/** Open Obsidian's settings modal on EMRALD's own tab. */
export function openPluginSettings(plugin: Plugin): void {
	const host = settingHost(plugin);
	host?.open?.();
	// manifest.id ('emrald') is the tab id — don't hardcode the display name.
	host?.openTabById?.(plugin.manifest.id);
}

/**
 * Open EMRALD's settings tab and scroll the "Manage effort levels" section
 * into view. The anchor class is applied by both the declarative and the
 * imperative settings paths.
 */
export function openELevelSettings(plugin: Plugin): void {
	openPluginSettings(plugin);
	// The tab renders asynchronously; give it a frame or two before scrolling.
	window.setTimeout(() => {
		const doc = plugin.app.workspace.containerEl.ownerDocument;
		const anchor = doc.querySelector('.emerald-elevel-manage-anchor');
		anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, 150);
}
