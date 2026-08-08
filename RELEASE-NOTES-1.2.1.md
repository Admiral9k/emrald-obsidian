# EMRALD v1.2.1 — Release Notes

**A fix release. If you installed 1.2.0, update — this is the build that actually contains the 1.2.0 fixes.**

## 🔧 Fixed

### Your sidebar stays where you put it
EMRALD was detaching its views when the plugin unloaded, which meant that every time you updated or restarted, any view you'd moved snapped back to its default spot. Views are registered with Obsidian, so Obsidian already handles cleanup — the extra teardown was only undoing your layout. Move the sidebar wherever you like; it stays there now.

### Type-safety pass across the plugin
Our TypeScript config targeted an older standard library, so a set of ordinary calls (`Object.entries`, `padStart`) resolved as untyped and quietly disabled type checking through everything downstream — timeblock, data cache, reassessment, settings, frontmatter sync, burnout monitor, and Data Center. Corrected at the source rather than patched call by call. No behavior change, but a class of latent bugs is now visible to the compiler instead of hidden from it.

## 🧹 Under the Hood

- Error handling in caught exceptions is now properly narrowed instead of assumed
- Lint gate runs the same type-aware ruleset as the Obsidian community review, so local checks match what review sees
- Release builds now fail if release notes are missing, so no release ships without a description

## Everything from 1.2.0

1.2.1 contains all 1.2.0 features. If you're coming from 1.1.2:

- **Predicted vs. actual effort** — per-project effort profiles show what you expected next to what it cost, kept separate on purpose
- **Effort forecast for multi-day projects** — built from your own history, not a generic estimate
- **Area / category tagging** — effort rolls up by life domain instead of one undifferentiated pile
- **Profile answers checked against behavior** — onboarding answers get flagged when real behavior diverges
- **Insight engine rebuild** — rotating phrasing, dismissal-based suppression, and two new categories (Discovery, Warnings)
- **Fixed:** peak performance hours (D11) was reading flat data and missing genuine peaks

## Known Limitation

On Obsidian 1.13.0 and later, EMRALD's settings don't yet appear in the global settings search. The settings tab itself works normally — open EMRALD's settings directly and everything is there. Adopting Obsidian's new declarative settings API is tracked for an upcoming release.

---

**Requires:** Obsidian 1.7.2+
**EMRALD account:** the free tier covers D1–D8 metrics and core tracking; Pro unlocks D9–D20, forecasting depth, and full insight categories.
