// Onboarding copy parity: the plugin deck (src/onboarding/copy.ts) must match the web deck
// (Emrald-freed-main/src/lib/onboarding-copy.ts), and both must match the master deck rows when the vault is present.
// Run:  node scripts/test-onboarding-copy-parity.cjs [pathToWebCopy.ts] [pathToMasterDeck.md]
// Defaults: ../Emrald-freed-main/src/lib/onboarding-copy.ts and the LLC-Brain deck. A missing web file FAILS; a missing deck is skipped.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const pluginFile = path.join(root, 'src/onboarding/copy.ts');
const webFile = path.resolve(process.argv[2] || path.join(root, '..', 'Emrald-freed-main', 'src', 'lib', 'onboarding-copy.ts'));
const deckFile = path.resolve(process.argv[3] || 'C:/Users/dstee/OBS_VAULTS/LLC-Brain/_wiki/engine/briefs/onboarding-plan-2026-11.md');

// Only these differences are allowed (client wording, not drift).
const ALLOWED_DIFF = {
  'cel.numbers': [/\bPro\b/g, 'PRO'],        // web "Pro", plugin "PRO"
  'optin.line': [/in Profile\./g, 'in Settings.'], // web Profile page, plugin Settings
};
const PLUGIN_ONLY = new Set(['welcome.bullets.1', 'welcome.bullets.2', 'welcome.bullets.3', 'welcome.bullets.4', 'connect.body', 'project.noteLink']);
const WEB_ONLY = (k) => k.startsWith('chk.'); // the Overview checklist is web only

function load(file) {
  const out = esbuild.buildSync({ entryPoints: [file], bundle: true, format: 'cjs', write: false, logLevel: 'silent' });
  const m = { exports: {} };
  new Function('module', 'exports', out.outputFiles[0].text)(m, m.exports);
  return m.exports;
}

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };

if (!fs.existsSync(webFile)) { console.log('FAIL web copy not found: ' + webFile); process.exit(1); }
const P = load(pluginFile);
const W = load(webFile);

// 1. keys
const pk = Object.keys(P.COPY), wk = Object.keys(W.COPY);
const onlyPlugin = pk.filter((k) => !(k in W.COPY) && !PLUGIN_ONLY.has(k));
const onlyWeb = wk.filter((k) => !(k in P.COPY) && !WEB_ONLY(k));
ok(onlyPlugin.length === 0, 'no unexpected plugin-only keys' + (onlyPlugin.length ? ': ' + onlyPlugin.join(', ') : ''));
ok(onlyWeb.length === 0, 'no unexpected web-only keys' + (onlyWeb.length ? ': ' + onlyWeb.join(', ') : ''));
ok([...PLUGIN_ONLY].every((k) => k in P.COPY), 'every declared plugin-only key exists');

// 2. shared strings identical (after the allowed client swaps)
const diffs = [];
for (const k of pk) {
  if (!(k in W.COPY)) continue;
  let w = W.COPY[k];
  if (ALLOWED_DIFF[k]) w = w.replace(ALLOWED_DIFF[k][0], ALLOWED_DIFF[k][1]);
  if (w !== P.COPY[k]) diffs.push(k);
}
ok(diffs.length === 0, 'shared strings identical (' + pk.filter((k) => k in W.COPY).length + ' keys)' + (diffs.length ? ': ' + diffs.join(', ') : ''));
for (const k of Object.keys(ALLOWED_DIFF)) {
  ok(W.COPY[k] !== P.COPY[k], 'declared client difference is real: ' + k);
}

// 3. work types and level options
ok(JSON.stringify(P.WORK_TYPES) === JSON.stringify(W.WORK_TYPES), 'work-type labels and descriptions identical');
ok(JSON.stringify(P.LEVEL_OPTIONS) === JSON.stringify(W.LEVEL_OPTIONS), 'level options identical');

// 4. binary rules on every string in the plugin deck: no em-dash, no retired words, no "budget"
const all = [...Object.values(P.COPY), ...Object.values(P.WORK_TYPES).flatMap((t) => [t.label, t.energy, t.drain])];
const bad = all.filter((s) => /\u2014|&mdash;|\bbudget\b|\bpredict|learns your|\bsmarter\b|\bstreak\b/i.test(s));
ok(bad.length === 0, 'no em-dash, "budget" or retired words in any string' + (bad.length ? ': ' + bad[0] : ''));

// 5. master deck rows (when the vault is present)
if (fs.existsSync(deckFile)) {
  const rows = {};
  for (const line of fs.readFileSync(deckFile, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const c = line.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (c.length >= 5) rows[c[0]] = c[3];
  }
  const legend = (rows['project.legend'] || '').split(' / ');
  const mismatch = [];
  for (const k of pk) {
    let d = k.startsWith('project.legend.') ? legend[Number(k.split('.').pop()) - 1] : rows[k];
    if (k.startsWith('welcome.bullets.')) { d = (rows['welcome.bullets'] || '').split(' / ')[Number(k.split('.').pop()) - 1]; }
    if (d === undefined) { mismatch.push(k + ' (no deck row)'); continue; }
    d = d.replace(/\s*\((plugin:.*?|number field.*?|optional;.*?)\)\s*$/, '').trim();
    if (k === 'optin.line') d = d.replace(/ \(plugin.*$/, '').replace('in Profile.', 'in Settings.');
    if (k === 'cel.numbers') d = d.replace(/ \(plugin.*$/, '').replace(/\bPro\b/g, 'PRO');
    if (d !== P.COPY[k]) mismatch.push(k);
  }
  ok(mismatch.length === 0, 'plugin deck matches the master deck rows' + (mismatch.length ? ': ' + mismatch.join(', ') : ''));
} else {
  console.log('SKIP master deck not found: ' + deckFile);
}

console.log(fails === 0 ? '\nAll parity checks passed.' : '\n' + fails + ' parity check(s) FAILED.');
process.exit(fails === 0 ? 0 : 1);
