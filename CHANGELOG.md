# Changelog

All notable changes to the Emrald Obsidian plugin will be documented in this file.

## [Unreleased]

### Added
- **Daily Summary for Templater / Periodic Notes** — EMRALD now writes `.emrald/daily-summary.md` to your vault, updated automatically on session stop, energy check-in, day close, and sidebar refresh. Include it in your daily note template with `<% tp.file.include("[[.emrald/daily-summary]]") %>`. Shows today's session count, total hours, project breakdown with effort levels, check-in scores, and burnout risk level. Works with Periodic Notes out of the box — your daily notes auto-populate with EMRALD data.
- **Export Data** — Export your EMRALD data as JSON from Settings or Effort Profile. Tier-gated: Free exports 90-day window (D1–D8, weekly digests); Pro exports full history with all metrics, insights, and digests. Saves to vault root.
- **Session notes in views** — Check-in notes now appear in Digest (collapsible table, filtered to notes-only check-ins). Receipt notes appear in E-Level Overview as cards with project name, date, E-level, duration, and stat chips. Clicking a project name opens the note in Obsidian.
- **Clear completed projects** — "Clear" button in the Completed accordion header. Confirms via dropdown, then sets projects to abandoned. Styled with E4 red accent.
- **UUID validation middleware** (API) — All path parameters validated against UUID format. Returns 400 on mismatch.
- **HTTPS enforcement** (API) — Middleware rejects non-HTTPS requests (except localhost).

### Changed
- **Daily hour limit marker** — Now rendered in blue-slate (#6B8BA4), 3px width, 0.85 opacity. Label positioned below the bar for clarity.
- **Data Center charts** — Height increased from 104px to 175px. Area fill removed for cleaner line-only rendering.
- **Digest time field** — Free-text input replaced with whole-hour dropdown for consistency.
- **Receipt modal simplified** — Single "Submit" button always shown. Going over your E-level now shows an informational nudge ("nice effort, consider switching") instead of a completion prompt. "Mark Complete" is now a project context-menu action only.
- **API metric history** — Limit raised from 100 to 2,500 rows (was only returning ~4 days of hourly data).
- **Insight Log badge** — Now uses live unread count from API instead of capping at 5.
- **Suggestions removed** from E-Level Overview (premature — will return when there's meaningful data to power them).

### Fixed
- **E-level marker position** — Fixed double-counting of `priorMinutesToday` that caused markers to push past the daily limit. Markers now use absolute position based on prescribed minutes.
- **Pinned Metrics vs Data Center rounding** — Aligned to `.toFixed(1)`. Fixed D8 pinned sparkline ×10 scaling.

## [1.0.1] — 2026-05-14

### Changed
- **Icon swap** — Plugin icon changed from ⚡ (zap) to 💎 (gem) across ribbon, sidebar, and all workspace tabs.
- **About EMRALD** — Refined copy: gem icon, research-tracking paragraph, privacy callout with data disclosure, link to getemrald.com/learn.
- **Onboarding** — Added privacy notice at step 9 explaining what data is sent and what stays local.
- **Minimum Obsidian version** — Raised to 1.7.2 (from 0.15.0).

### Fixed
- **Community plugin review compliance** — Resolved all automated review bot issues: replaced `window.setTimeout`/`window.setInterval` with `activeWindow` equivalents, inlined builtin-modules list, fixed manifest name casing, corrected `minAppVersion`.
- **CSS cleanup** — Merged 37 duplicate selectors, removed 13 of 14 `!important` declarations (only `.is-hidden` remains), expanded short hex codes, removed orphaned CSS block.
- **CI pipeline** — Added GitHub Actions workflow (Node 22, esbuild build, `--legacy-peer-deps` for eslint peer conflicts).
- **Feedback link** — Now always renders at bottom of Effort Management section for all tiers.
- **Empty suggestion cards** — Filtered out before rendering.

## [1.0.0] — 2026-05-12

### Added
- **Initial release** — Full Effort Management sidebar for Obsidian.
- **Timeblock** — 24-hour ambient clock with real-time session tracking. Start/stop sessions, E-level markers, overtime detection, daily hour override.
- **Projects** — 5 active project slots with folder-based mapping. Context menus for effort assignment, completion, and archival. Inactive accordion for paused work.
- **Daily Check-in** — Energy, focus, stress, sleep quality, physical energy, emotional state, mental clarity. Feeds into D-metrics and AI insights.
- **Effort Management section** — Pinned metric sparklines (max 4), rotating insight bulletin, 6 workspace view buttons.
- **6 Workspace Views** — E-Level Overview, Insight Log, Data Center, Effort Profile, Burnout Monitor, Digest.
- **6 Modals** — Effort Receipt, Energy Check-in, E-Level Assignment, Hour Override, Close Day, Burnout Warning.
- **Onboarding** — 9-step guided setup: API connection, folder mapping, project selection, trait assessment, energy check-in, daily hours, digest preferences.
- **Offline support** — Sessions track locally with action queue that replays on reconnect.
- **Tier awareness** — Free and Pro tier gating with tasteful upgrade prompts (PRO pill badges, tap-to-discover views).
- **About EMRALD** — In-plugin info view with research citations, privacy explanation, and links.
- **Timer resilience** — Survives offline periods, reconnects gracefully, recovers interrupted sessions (P19 fix).
- **Digest filtering** — Period and type filters. Free tier correctly limited to weekly observations.

---

[Unreleased]: https://github.com/Admiral9k/emrald-obsidian/compare/1.0.1...HEAD
[1.0.1]: https://github.com/Admiral9k/emrald-obsidian/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/Admiral9k/emrald-obsidian/releases/tag/1.0.0
