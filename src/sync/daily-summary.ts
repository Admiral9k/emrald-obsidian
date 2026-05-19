// Daily Summary Writer
// Writes .emrald/daily-summary.md to the vault, updated on:
//   - Session stop
//   - Energy check-in
//   - Day close
//   - Sidebar refresh
//
// Option A architecture: cache file approach.
// EMRALD writes the file; Templater reads it via tp.file.include.

import type EmraldPlugin from '../../main';

const SUMMARY_FOLDER = '.emrald';
const SUMMARY_PATH = `${SUMMARY_FOLDER}/daily-summary.md`;
const README_PATH = `${SUMMARY_FOLDER}/README.md`;

/**
 * Write (or update) the daily summary file in the vault.
 * Gathers today's sessions, latest check-in, and burnout state from the API,
 * then writes a clean markdown file that Templater can include.
 */
export async function writeDailySummary(plugin: EmraldPlugin): Promise<void> {
	if (!plugin.apiClient.isConfigured()) return;

	const vault = plugin.app.vault;
	const today = new Date().toISOString().split('T')[0];

	// Gather data in parallel
	const [sessionsResp, checkinResp, burnoutResp] = await Promise.all([
		plugin.apiClient.getTodaySessions(),
		plugin.apiClient.getTodayCheckin(),
		plugin.apiClient.getBurnoutState()
	]);

	// ── Sessions ────────────────────────────────────
	let sessionCount = 0;
	let totalMinutes = 0;
	const projectMap = new Map<string, { name: string; effortLevel: string; minutes: number; sessions: number }>();

	if (sessionsResp.data && Array.isArray(sessionsResp.data)) {
		for (const sess of sessionsResp.data) {
			if (sess.status === 'completed' && sess.duration_minutes) {
				sessionCount++;
				totalMinutes += sess.duration_minutes;
				const existing = projectMap.get(sess.item_id);
				if (existing) {
					existing.minutes += sess.duration_minutes;
					existing.sessions++;
				} else {
					// Try to resolve project name from tracked items
					const itemName = await resolveItemName(plugin, sess.item_id);
					projectMap.set(sess.item_id, {
						name: itemName,
						effortLevel: '',
						minutes: sess.duration_minutes,
						sessions: 1
					});
				}
			}
		}
	}

	// Try to fill in effort levels from tracked items
	const itemsResp = await plugin.apiClient.getItems();
	if (itemsResp.data && Array.isArray(itemsResp.data)) {
		for (const item of itemsResp.data) {
			const proj = projectMap.get(item.id);
			if (proj) {
				proj.name = item.name;
				proj.effortLevel = item.effort_level ?? '';
			}
		}
	}

	// ── Build markdown ──────────────────────────────
	const lines: string[] = [];

	// Frontmatter for machine-readability
	lines.push('---');
	lines.push(`date: "${today}"`);
	lines.push(`sessions: ${sessionCount}`);
	lines.push(`total_minutes: ${Math.round(totalMinutes)}`);
	lines.push(`generated: "${new Date().toISOString()}"`);
	lines.push('---');
	lines.push('');

	// Header
	lines.push('## Today\'s Effort');

	// Session summary
	const totalH = Math.floor(totalMinutes / 60);
	const totalM = Math.round(totalMinutes % 60);
	const timeStr = totalH > 0
		? (totalM > 0 ? `${totalH}h ${totalM}m` : `${totalH}h`)
		: `${totalM}m`;
	lines.push(`- **Sessions:** ${sessionCount} | **Total:** ${timeStr}`);

	// Check-in data
	const checkin = checkinResp.data;
	if (checkin && typeof checkin === 'object' && 'physical_energy' in checkin) {
		const parts: string[] = [];
		if (typeof checkin.physical_energy === 'number') parts.push(`Energy ${checkin.physical_energy}/10`);
		if (typeof checkin.mental_clarity === 'number') parts.push(`Clarity ${checkin.mental_clarity}/10`);
		if (typeof checkin.emotional_state === 'number') parts.push(`Mood ${checkin.emotional_state}/10`);
		if (typeof checkin.sleep_quality === 'number') parts.push(`Sleep ${checkin.sleep_quality}/10`);
		if (parts.length > 0) {
			lines.push(`- **Check-in:** ${parts.join(' | ')}`);
		}
	}

	// Burnout state
	const burnout = burnoutResp.data;
	if (burnout && typeof burnout === 'object' && 'current_phase' in burnout) {
		const phaseLabel = burnout.current_phase
			? burnout.current_phase.charAt(0).toUpperCase() + burnout.current_phase.slice(1)
			: 'Unknown';
		const scoreStr = typeof burnout.score === 'number' ? ` (${burnout.score}/100)` : '';
		lines.push(`- **Burnout Risk:** ${phaseLabel}${scoreStr}`);
	}

	// Project breakdown
	if (projectMap.size > 0) {
		lines.push('');
		lines.push('## Project Breakdown');
		for (const proj of projectMap.values()) {
			const projH = Math.floor(proj.minutes / 60);
			const projM = Math.round(proj.minutes % 60);
			const projTime = projH > 0
				? (projM > 0 ? `${projH}h ${projM}m` : `${projH}h`)
				: `${projM}m`;
			const eLevelStr = proj.effortLevel ? ` (${proj.effortLevel})` : '';
			lines.push(`- **${proj.name}**${eLevelStr}: ${projTime} ×${proj.sessions}`);
		}
	}

	// No-data fallback
	if (sessionCount === 0 && !checkin) {
		lines.push('');
		lines.push('*No sessions or check-ins recorded yet today.*');
	}

	lines.push('');

	const content = lines.join('\n');

	// ── Write to vault ──────────────────────────────
	try {
		// Ensure .emrald folder exists
		const folderExists = vault.getAbstractFileByPath(SUMMARY_FOLDER);
		if (!folderExists) {
			try {
				await vault.createFolder(SUMMARY_FOLDER);
			} catch {
				// Folder may already exist on disk but not in Obsidian's index
			}
		}

		// Write or overwrite the summary file
		const existingFile = vault.getAbstractFileByPath(SUMMARY_PATH);
		if (existingFile) {
			await vault.modify(existingFile as import('obsidian').TFile, content);
		} else {
			try {
				await vault.create(SUMMARY_PATH, content);
			} catch {
				// File exists on disk but not in Obsidian's index — try adapter.write directly
				await vault.adapter.write(SUMMARY_PATH, content);
			}
		}

		// Write README once (never overwrite)
		const readmeExists = vault.getAbstractFileByPath(README_PATH);
		if (!readmeExists) {
			try {
				await vault.create(README_PATH, getReadmeContent());
			} catch {
				// Already exists on disk
			}
		}
	} catch (err) {
		console.warn('[EMRALD] Failed to write daily summary:', err);
	}
}

/**
 * Resolve an item name from the API, with fallback.
 */
async function resolveItemName(plugin: EmraldPlugin, itemId: string): Promise<string> {
	try {
		const resp = await plugin.apiClient.getItems();
		if (resp.data && Array.isArray(resp.data)) {
			const item = resp.data.find((i: { id: string }) => i.id === itemId);
			if (item) return item.name;
		}
	} catch {
		// Fallback silently
	}
	return 'Unknown project';
}

/**
 * README content for the .emrald folder — created once.
 */
function getReadmeContent(): string {
	return `# .emrald

This folder is managed by the EMRALD plugin.

## daily-summary.md

Updated automatically when you stop a session, complete a check-in, close your day, or refresh the sidebar. Always reflects today's data.

### Use with Templater

Add this line to your daily note template:

\`\`\`
<% tp.file.include("[[.emrald/daily-summary]]") %>
\`\`\`

Your daily notes will auto-populate with your effort data.

### Use without Templater

You can open this file directly, or link to it from any note:

\`\`\`
![[.emrald/daily-summary]]
\`\`\`

### What's included

- Session count and total hours
- Project breakdown (name, effort level, time, session count)
- Check-in scores (energy, clarity, mood, sleep)
- Burnout risk level and score
- YAML frontmatter for machine-readability
`;
}
