# Deferred work

Tracked items intentionally not done yet, with the reasoning. Kept in-repo so the decision survives.

## Enforce the daily API call quota

**Status:** deferred, tracked
**Effect while deferred:** no per-tier request ceiling on authenticated traffic. Free and Pro accounts have the same effective request limit.

The tier-aware *sync interval* is implemented and correct (`main.ts`, `startSync()` — Pro floors at 1 minute, Free at 5). The per-day API call ceiling was never built: there is no counter, column, or middleware for it anywhere in the API. Unauthenticated endpoints are separately protected by the `rate_limit_log` abuse throttle.

Marketing copy has been corrected to claim only the sync behavior that is actually enforced.

**To do it properly:** add a daily counter keyed by user with a date stamp, increment it in the existing auth middleware (which already resolves user and tier per request), return 429 past the ceiling, and prefer a rolling date check over a scheduled reset.

## `removeSessionStart()` is a no-op stub

**Status:** deferred, tracked
**Location:** `src/sync/offline-queue.ts:251`

Every filter branch returns `true`, so nothing is ever removed, and the function has zero call sites. From its name and position it was intended to drop a queued session-start action on reconnect so replay doesn't create a duplicate session.

Left as-is deliberately during the 1.2.x review-fix batch — the parameter was renamed to `_localId` to satisfy lint and the state documented, but changing offline-replay behavior mid-release is a correctness decision, not a lint fix. Either implement the dedup properly or delete the stub; don't leave it looking implemented.

## Resolved

- **Dead `version` npm lifecycle hook** (removed `03831d9`) — `package.json` declared `"version": "node version-bump.mjs && git add manifest.json versions.json"` but `version-bump.mjs` never existed in this repo; git history confirms it was never added, not deleted. It came from Obsidian's sample plugin, which ships both the entry and the file — only the entry was copied. Inert in practice, since npm's `version` **lifecycle hook** only fires on `npm version <x>` and CI calls `esbuild` directly, but `npm version patch` would have failed on a missing module at exactly the wrong moment. Removed rather than backfilled: version bumps are done by hand across manifest/package/versions together, as 1.2.1 was.
- **Declarative settings API** (done in 1.3.0) - settings tab rebuilt on `getSettingDefinitions()`, legacy `display()` removed, `minAppVersion` 1.13.0. The five open questions that deferred it were answered by the 1.13.1 typings. The "stray no-op `;`" sweep went with the rewrite.
- **API key in plaintext `data.json`** (done in 1.3.1) - moved to Obsidian SecretStorage; settings keep only the secret name.
