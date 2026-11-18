// Runs every harness in scripts/ the way the release gate does. Needs a built main.js (npm run build).
//   npm test            all harnesses, exit 1 on the first failing one (the rest still run and are listed)
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = path.join(os.tmpdir(), 'emrald-onboarding-bundle.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src/onboarding/onboarding.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], outfile: bundle, logLevel: 'silent' });

const suites = [
  ['test-onboarding-copy-parity.cjs', []],
  ['test-onboarding-flow.cjs', []],
  ['test-onboarding-connect.cjs', ['main.js', bundle]],
  ['test-apikey-migration.cjs', ['main.js']],
  ['test-recap-prefs.cjs', ['main.js']],
  ['test-recap-schedule.cjs', []],
  ['test-overtime-autopause.cjs', []],
  ['test-receipt-graph.cjs', []],
  ['test-answer-edit.cjs', []],
  ['test-data-center-d21.cjs', []],
];
const failed = [];
for (const [file, args] of suites) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file), ...args], { cwd: root, encoding: 'utf8' });
  const tail = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
  const bad = r.status !== 0 || /FAIL(?!ED PASS)/.test(r.stdout || '') && !/ALL PASS|ALL PASSED|all passed|checks passed/.test(tail);
  console.log((bad ? 'FAIL ' : 'ok   ') + file + '  ' + tail);
  if (bad) { failed.push(file); console.log((r.stdout || '').split(/\r?\n/).filter((l) => /FAIL|Error/.test(l)).slice(0, 12).join('\n')); console.log((r.stderr || '').slice(-600)); }
}
console.log(failed.length ? '\n' + failed.length + ' suite(s) failed: ' + failed.join(', ') : '\nAll ' + suites.length + ' suites passed.');
process.exit(failed.length ? 1 : 0);
