# Deferred work

Tracked items intentionally not done yet, with the reasoning. Kept in-repo so the decision survives.

## Adopt Obsidian's declarative settings API (`getSettingDefinitions`)

**Status:** deferred, tracked
**Raised by:** Obsidian community review, warning on `src/settings.ts:82`
**Effect while deferred:** on Obsidian 1.13.0+, EMRALD's settings do not appear in the global settings *search*. The settings tab itself works normally on every version.

**Why deferred rather than done:**

- The installed typings are `obsidian@1.12.3`, and neither `getSettingDefinitions` nor `SettingDefinition` exists in `obsidian.d.ts`. The API postdates the typings we build against, so implementing now means casting through `unknown` or hand-rolling a guessed interface.
- The official migration guide (`docs.obsidian.md/plugins/guides/migrate-declarative-settings`) is Catalyst-gated, so the exact shape can't be confirmed from public docs.
- Obsidian supports the existing `display()` approach indefinitely. This is a recommended migration, not a deprecation with a deadline.
- `minAppVersion` is 1.7.2, so the affected users are a subset, and the only lost capability is settings search.

Writing an API surface from a summary rather than a spec risks shipping settings that silently render nothing, which is worse than the current warning.

**To do it properly:**

1. Bump the `obsidian` dev dependency to typings that include the declarative settings API
2. Read the real migration guide
3. Convert all 8 settings in `EmraldSettingTab`
4. Keep `display()` in place while `minAppVersion` is below 1.13.0
5. Verify on 1.13.0+ that the settings actually surface in global search

**Also sweep while in there:** stray no-op `;` at `src/settings.ts:92`, pre-existing since the round-3 review fixes. Harmless, no lint complaint.

## Enforce the daily API call quota

**Status:** deferred, tracked
**Effect while deferred:** no per-tier request ceiling on authenticated traffic. Free and Pro accounts have the same effective request limit.

The tier-aware *sync interval* is implemented and correct (`main.ts`, `startSync()` — Pro floors at 1 minute, Free at 5). The per-day API call ceiling was never built: there is no counter, column, or middleware for it anywhere in the API. Unauthenticated endpoints are separately protected by the `rate_limit_log` abuse throttle.

Marketing copy has been corrected to claim only the sync behavior that is actually enforced.

**To do it properly:** add a daily counter keyed by user with a date stamp, increment it in the existing auth middleware (which already resolves user and tier per request), return 429 past the ceiling, and prefer a rolling date check over a scheduled reset.
