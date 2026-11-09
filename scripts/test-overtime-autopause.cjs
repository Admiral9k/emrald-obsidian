// S14 resume fix: the overtime auto-pause must not re-pause a session the user just resumed.
// Simulates the tick loop against the real helper (bundled with esbuild). Run: node scripts/test-overtime-autopause.cjs
const esbuild = require('esbuild');
const path = require('path');
const src = path.join(__dirname, '..', 'src/components/overtimeAutoPause.ts');
const out = esbuild.buildSync({ entryPoints: [src], bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
const m = { exports: {} }; new Function('module', 'exports', out)(m, m.exports);
const { overtimeAutoPauseDue, overtimeThresholdMin } = m.exports;
let fail = 0; const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const GP = 60; // prescribed minutes

ok(overtimeThresholdMin(0, null) === Infinity, 'no prescribed time: never fires');
ok(overtimeThresholdMin(GP, null) === 180, 'threshold = prescribed + 120');
ok(!overtimeAutoPauseDue(180, GP, null) && overtimeAutoPauseDue(180.01, GP, null), 'fires only past prescribed + 120');

// OLD behaviour (the bug): resume re-armed with no snooze, elapsed excludes the pause, so the very next tick pauses again.
const elapsedAtPause = 181;
ok(overtimeAutoPauseDue(elapsedAtPause, GP, null), 'old: re-pauses on the first tick after resume (the reported bug)');

// NEW behaviour: resume records a snooze at the work minutes at resume.
const snooze = elapsedAtPause;
let paused = false;
for (let min = elapsedAtPause; min <= elapsedAtPause + 119; min += 1) if (overtimeAutoPauseDue(min, GP, snooze)) paused = true;
ok(!paused, 'new: resumed session keeps running for the next 2 hours of work');
ok(overtimeAutoPauseDue(elapsedAtPause + 120.01, GP, snooze), 'new: re-asks after 2 more hours of work');

// Resume well before the line must not push the line out.
ok(overtimeThresholdMin(GP, 30) === 180, 'early resume leaves the +2h line where it was');
ok(overtimeThresholdMin(GP, NaN) === 180 && overtimeThresholdMin(GP, undefined) === 180, 'bad snooze values are ignored');
process.exit(fail ? 1 : 0);
