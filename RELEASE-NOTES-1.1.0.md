# EMRALD v1.1.0 — Release Notes

**Templater integration, export data, P0 fixes, and polish.**

## ✨ New Features

### Daily Summary for Templater / Periodic Notes
EMRALD now writes `.emrald/daily-summary.md` to your vault — updated automatically on session stop, check-in, day close, and sidebar refresh. Drop it into your daily note template:

```
<% tp.file.include("[[.emrald/daily-summary]]") %>
```

Your daily notes auto-populate with today's sessions, hours, project breakdown, check-in scores, and burnout risk. Setup guide included in `.emrald/README.md` (created automatically).

### Export Data
Export your EMRALD data as JSON from **Settings** or **Effort Profile**. Free tier exports 90 days of D1–D8 metrics; Pro exports everything. Saves to your vault root.

### Session Notes in Views
- **Digest** — Check-in notes appear in a collapsible table, filtered to the digest period
- **E-Level Overview** — Receipt notes render as cards with project name, date, effort level, duration, and stat chips. Click a project name to open the note in Obsidian.

### Clear Completed Projects
"Clear" button in the Completed accordion header. Confirms via dropdown menu, then archives projects as abandoned.

## 🔧 Improvements

- **Daily hour limit marker** — Blue-slate (#6B8BA4), cleaner positioning with label below bar
- **Chart height** — Data Center charts increased from 104px to 175px for better readability
- **Chart area fill** removed for cleaner line-only rendering
- **Receipt modal** simplified — single "Submit" button, informational nudge for over-E-level sessions
- **Digest time** — dropdown selector replaces free-text input
- **Per-view icons** — each workspace view now has its own Lucide icon in the tab
- **API metric history** — limit raised from 100 to 2,500 rows
- **Insight Log badge** — uses live unread count instead of capping at 5

## 🐛 Fixes

- **E-level marker position** — fixed double-counting that pushed markers past the daily limit
- **Pinned Metrics rounding** — aligned to `.toFixed(1)`, fixed D8 sparkline scaling
- **View cleanup on unload** — all workspace views properly detached when plugin is disabled

## 🔒 Security

- UUID validation middleware on all API path parameters
- HTTPS enforcement (except localhost)

## 📋 Internal

- TypeScript is now the single source of truth (BUILD-RULES.md)
- Full TS/JS reconciliation — no more compiled-only fixes
- CSS: 0 duplicate selectors, 0 `!important` declarations

---

**Full changelog:** [CHANGELOG.md](https://github.com/Admiral9k/emrald-obsidian/blob/main/CHANGELOG.md)
