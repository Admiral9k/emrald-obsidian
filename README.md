# EMRALD for Obsidian

**Track what work costs you, not just what you finish.**

![EMRALD for Obsidian](screenshots/hero.png)

EMRALD is an effort management plugin for Obsidian. It helps you track patterns around effort, flow, energy, recovery, and burnout risk without leaving the notes and projects you already rely on.

Most productivity tools can tell you what got done.
EMRALD is built to help you understand what the work actually **cost** you.

---

## Why EMRALD exists

A task list can say you're doing fine while your actual capacity says otherwise.

EMRALD was built for that gap.

Instead of forcing you into a brand-new productivity system, it adds an effort-aware layer to Obsidian so you can keep the workflow you already trust and gain a clearer picture of how your work affects you over time.

**Keep your stuff. We'll make it smarter.**

---

## What it does

- Track focused work sessions from inside Obsidian
- Capture quick post-session effort receipts
- Record daily check-ins around energy and readiness
- Monitor patterns in effort, flow, and recovery over time
- Surface burnout-related signals before they become obvious
- Keep project and effort awareness close to your notes
- Work alongside your vault instead of replacing it

---

## Who it's for

EMRALD is especially useful if you:
- already manage work or life systems inside Obsidian
- want more than time tracking or task completion
- regularly feel "productive" but still end the day cooked
- care about sustainable output, not just maximum output
- want your system to reflect real capacity, not fantasy capacity

---

## Screenshots

### The sidebar — your daily workspace
Timeblock timer, projects, and effort tools — always one click away.

| Timeblock (active session) | Projects |
| :---: | :---: |
| ![Timer running](screenshots/timer-running-dark.png) | ![Projects](screenshots/sidebar-projects-dark.png) |

### The workspace views — your patterns over time

**E-Level Overview** — see how your day breaks down across effort tiers.
![E-Level Overview](screenshots/elevel-overview-dark.png)

**Effort Profile** — how EMRALD sees your capacity, endurance, and motivation.
![Effort Profile](screenshots/effort-profile-dark.png)

**Burnout Monitor** — sustained-effort signal watching, before patterns get obvious.
![Burnout Monitor](screenshots/burnout-monitor-dark.png)

_Screenshots show dark mode. EMRALD adapts to your active Obsidian theme._

### See it in action

A full session flow — Start → work → Stop → Effort Receipt:

![EMRALD demo](screenshots/demo.gif)

---

## Getting started

1. Create an account at **app.effortmastery.com**
2. Sign in and generate your API key
3. Install the EMRALD plugin in Obsidian
4. Open EMRALD settings and paste in your API key
5. Start your first session

If this is your first time using EMRALD, expect the value to build over time.
The first few sessions establish the baseline. The pattern recognition gets stronger as the data accumulates.

---

## Companion theme

The optional **EMRALD Theme** is the official companion theme for the plugin.
It is built to match the workspace visually, but it is completely optional and can stand on its own.

---

## Privacy and data

EMRALD connects to the Effort Mastery API (`api.effortmastery.com`) to sync session data, metrics, and insights. This is how the plugin works — there is no local-only mode.

**What EMRALD sends:**
- Session data (start/stop times, effort level, project association)
- Daily check-in responses (energy, readiness)
- Project metadata (name, folder, effort level)

**What EMRALD never sends:**
- Note content — EMRALD does not read, upload, or modify the body of your notes
- File contents, attachments, or images
- Vault structure beyond the folders you designate as Active/Inactive during onboarding

**Vault access:**
- EMRALD uses `vault.getFiles()` during onboarding to let you pick Active and Inactive project folders
- `processFrontMatter` writes metadata (effort-level, session info) to note YAML — never note content
- No background vault scanning occurs outside of the folder sync you configure

**External domains:**
- `api.effortmastery.com` — API (session sync, metrics, insights, authentication)
- `app.effortmastery.com` — linked from settings for account management
- `getemrald.com` — linked from the About view for documentation

No data is shared with third parties. No analytics or tracking SDKs are included.
Full privacy policy: [effortmastery.com/privacy](https://effortmastery.com/privacy)

---

## Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

---

## License

MIT — Effort Mastery LLC
