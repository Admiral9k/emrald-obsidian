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

## Templater & Periodic Notes integration

EMRALD automatically writes a daily summary file to your vault at `.emrald/daily-summary.md`. This file updates every time you stop a session, complete a check-in, or close your day.

If you use **Templater** and **Periodic Notes**, you can pull this data into your daily notes automatically.

### Setup (3 steps)

1. **Install Templater** from the Obsidian community plugins, if you haven't already.

2. **Add this line** to your daily note template wherever you want the summary to appear:

   ```
   <% tp.file.include("[[.emrald/daily-summary]]") %>
   ```

3. **That's it.** The next time Periodic Notes creates a daily note (or you manually create one from your template), your EMRALD data fills in automatically.

### What the summary includes

- **Session count and total hours** for the day
- **Project breakdown** — which projects you worked on, how long, what effort level, how many sessions
- **Check-in scores** — energy, focus, stress, sleep quality, mental clarity
- **Burnout risk level** — Low / Moderate / High / Critical with score

### Example output

```markdown
## Today's Effort
- **Sessions:** 3 | **Total:** 4h 12m
- **Check-in:** Energy 4/5 | Focus 4/5 | Stress 2/5 | Sleep 7/10 | Clarity 8/10
- **Burnout Risk:** Low (18/100)

## Project Breakdown
- **EMRALD MVP** (E3): 2h 48m ×2
- **Marketing** (E2): 1h 24m ×1
```

### Notes

- The `.emrald` folder is created automatically the first time EMRALD writes the summary.
- The file updates in place — it always reflects _today's_ data, not historical.
- If you don't use Templater, you can still open `.emrald/daily-summary.md` directly or link to it manually.
- Works with any template system that can include a file by wiki-link.

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
