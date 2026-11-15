// Onboarding copy parity.
//   plugin deck  src/onboarding/copy.ts   vs   web deck  ../Emrald-freed-main/src/lib/onboarding-copy.ts   vs   the master deck rows.
// Run:  node scripts/test-onboarding-copy-parity.cjs [webCopy.ts] [masterDeck.md]
//       node scripts/test-onboarding-copy-parity.cjs --update-snapshot   (after a deliberate deck change, on the PC that has the deck)
// The master deck lives only on Devon's PC, so a committed snapshot of its rows (scripts/onboarding-deck.snapshot.json)
// stands in everywhere else (CI). With the deck present the snapshot must match it, so it cannot go stale.
// A missing web copy FAILS locally; in CI (CI=true) it is reported and the plugin is checked against the deck snapshot only.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const updateSnapshot = process.argv.includes('--update-snapshot');
const pluginFile = path.join(root, 'src/onboarding/copy.ts');
const questionsFile = path.join(root, 'src/onboarding/questions.ts');
const webFile = path.resolve(args[0] || path.join(root, '..', 'Emrald-freed-main', 'src', 'lib', 'onboarding-copy.ts'));
const deckFile = path.resolve(args[1] || 'C:/Users/dstee/OBS_VAULTS/LLC-Brain/_wiki/engine/briefs/onboarding-plan-2026-11.md');
const snapFile = path.join(__dirname, 'onboarding-deck.snapshot.json');

// Allowed client differences (wording, not drift).
const ALLOWED_DIFF = {
  'cel.numbers': [/\bPro\b/g, 'PRO'],              // web "Pro", plugin "PRO"
  'optin.line': [/in Profile\./g, 'in Settings.'], // web Profile page, plugin Settings
};
const PLUGIN_ONLY = new Set(['welcome.bullets.1', 'welcome.bullets.2', 'welcome.bullets.3', 'welcome.bullets.4', 'connect.body', 'connect.cta', 'connect.skip', 'connect.privacy', 'project.noteLink']);
const WEB_ONLY = (k) => k.startsWith('chk.'); // the Overview checklist is web only

// Retired and banned words (copy-standard-2026-11 sections 4 to 6, plus Devon's rulings).
const BANNED = [
  [/\u2014|&mdash;/, 'em-dash'],
  [/\bbudget\b/i, 'budget (say work hours)'],
  [/\bpredict/i, 'predict'],
  [/\bsmarter\b/i, 'smarter'],
  [/\bstreaks?\b/i, 'streak'],
  [/\bhonest/i, 'honest'],
  [/\baccura(?:te|cy)\b/i, 'accuracy / accurate'],
  [/\bknows? you\b|\blearns? you/i, 'knows you / learns you'],
  [/\btuned to you\b/i, 'tuned to you'],
  [/\bfaster sync\b/i, 'Faster sync'],
  [/\bverification tax\b/i, 'verification tax'],
  [/\blearns?\b/i, 'learn / learns'],
  [/\bgets? better\b/i, 'gets better'],
  [/\bweeks of data\b/i, 'weeks of data'],
  [/\btrains? you\b/i, 'trains you'],
  [/\bonly as\b|\bno other\b/i, 'only as / no other'],
];

function load(file) {
  const out = esbuild.buildSync({ entryPoints: [file], bundle: true, format: 'cjs', write: false, logLevel: 'silent' });
  const m = { exports: {} };
  new Function('module', 'exports', out.outputFiles[0].text)(m, m.exports);
  return m.exports;
}
function parseDeck(file) {
  const rows = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const c = line.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (c.length >= 5 && c[0] && !/^-+$/.test(c[0]) && c[0] !== 'key') rows[c[0]] = c[3];
  }
  return rows;
}

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const inCI = !!process.env.CI;

const P = load(pluginFile);
const Q = load(questionsFile);
const pk = Object.keys(P.COPY);

// ── master deck rows: the live deck when present, else the committed snapshot ──
let deckRows = null, deckSource = '';
if (fs.existsSync(deckFile)) {
  deckRows = parseDeck(deckFile); deckSource = 'master deck';
  if (updateSnapshot) { fs.writeFileSync(snapFile, JSON.stringify(deckRows, null, 1) + '\n'); console.log('snapshot written: ' + Object.keys(deckRows).length + ' rows'); }
  if (fs.existsSync(snapFile)) {
    const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
    const stale = Object.keys(deckRows).filter((k) => snap[k] !== deckRows[k]).concat(Object.keys(snap).filter((k) => !(k in deckRows)));
    ok(stale.length === 0, 'deck snapshot is current' + (stale.length ? ' (run --update-snapshot): ' + stale.slice(0, 6).join(', ') : ''));
  } else ok(false, 'no deck snapshot committed (run --update-snapshot on the PC with the deck)');
} else if (fs.existsSync(snapFile)) {
  deckRows = JSON.parse(fs.readFileSync(snapFile, 'utf8')); deckSource = 'committed deck snapshot (the master deck is not in this checkout)';
  console.log('NOTE master deck not found; using ' + path.relative(root, snapFile));
} else {
  ok(false, 'neither the master deck nor a deck snapshot is available');
}

// ── plugin vs deck rows ──
if (deckRows) {
  const legend = (deckRows['project.legend'] || '').split(' / ');
  const mismatch = [];
  for (const k of pk) {
    let d;
    if (k.startsWith('project.legend.')) d = legend[Number(k.split('.').pop()) - 1];
    else if (k.startsWith('welcome.bullets.')) d = (deckRows['welcome.bullets'] || '').split(' / ')[Number(k.split('.').pop()) - 1];
    else d = deckRows[k];
    if (d === undefined) { mismatch.push(k + ' (no deck row)'); continue; }
    d = d.replace(/\s*\((plugin:.*?|number field.*?|optional;.*?)\)\s*$/, '').trim();
    if (k === 'optin.line') d = d.replace(/ \(plugin.*$/, '').replace('in Profile.', 'in Settings.');
    if (k === 'cel.numbers') d = d.replace(/ \(plugin.*$/, '').replace(/\bPro\b/g, 'PRO');
    if (d !== P.COPY[k]) mismatch.push(k);
  }
  ok(mismatch.length === 0, 'plugin copy matches the ' + deckSource + ' (' + pk.length + ' keys)' + (mismatch.length ? ': ' + mismatch.join(', ') : ''));
}

// ── plugin vs web ──
if (fs.existsSync(webFile)) {
  const W = load(webFile);
  const wk = Object.keys(W.COPY);
  const onlyPlugin = pk.filter((k) => !(k in W.COPY) && !PLUGIN_ONLY.has(k));
  const onlyWeb = wk.filter((k) => !(k in P.COPY) && !WEB_ONLY(k));
  ok(onlyPlugin.length === 0, 'no unexpected plugin-only keys' + (onlyPlugin.length ? ': ' + onlyPlugin.join(', ') : ''));
  ok(onlyWeb.length === 0, 'no unexpected web-only keys' + (onlyWeb.length ? ': ' + onlyWeb.join(', ') : ''));
  const diffs = [];
  for (const k of pk) {
    if (!(k in W.COPY)) continue;
    let w = W.COPY[k];
    if (ALLOWED_DIFF[k]) w = w.replace(ALLOWED_DIFF[k][0], ALLOWED_DIFF[k][1]);
    if (w !== P.COPY[k]) diffs.push(k);
  }
  ok(diffs.length === 0, 'shared strings identical to web (' + pk.filter((k) => k in W.COPY).length + ' keys)' + (diffs.length ? ': ' + diffs.join(', ') : ''));
  for (const k of Object.keys(ALLOWED_DIFF)) ok(W.COPY[k] !== P.COPY[k], 'declared client difference is real: ' + k);
  ok(JSON.stringify(P.WORK_TYPES) === JSON.stringify(W.WORK_TYPES), 'work-type labels and descriptions identical to web');
  ok(JSON.stringify(P.LEVEL_OPTIONS) === JSON.stringify(W.LEVEL_OPTIONS), 'level options identical to web');
} else if (inCI) {
  console.log('NOTE web copy not in this checkout (CI): plugin checked against the deck snapshot only');
} else {
  ok(false, 'web copy not found: ' + webFile);
}
ok([...PLUGIN_ONLY].every((k) => k in P.COPY), 'every declared plugin-only key exists');

// ── banned words over EVERY user-facing string: deck copy, work types, the 13 questions and their options ──
const strings = [
  ...Object.entries(P.COPY).map(([k, v]) => [k, v]),
  ...Object.entries(P.WORK_TYPES).flatMap(([k, t]) => [[k + '.label', t.label], [k + '.energy', t.energy], [k + '.drain', t.drain]]),
  ...Q.QUESTIONS.flatMap((q) => [
    [q.key + '.question', q.question],
    ...(q.low ? [[q.key + '.low', q.low]] : []), ...(q.high ? [[q.key + '.high', q.high]] : []),
    ...((q.options || []).flatMap((o) => [[q.key + '.' + o.value + '.label', o.label], ...(o.desc ? [[q.key + '.' + o.value + '.desc', o.desc]] : [])])),
  ]),
];
ok(Q.QUESTIONS.length === 13, 'the questions flow has 13 questions');
// "learning" is allowed only in the deck's own project.what example ("learning a new song on piano"); any other use is flagged by the learn/learns rule above.
const hits = [];
for (const [k, s] of strings) for (const [re, name] of BANNED) if (re.test(s)) hits.push(k + ' [' + name + ']');
ok(hits.length === 0, 'no banned word in any of ' + strings.length + ' strings' + (hits.length ? ': ' + hits.slice(0, 8).join('; ') : ''));

console.log(fails === 0 ? '\nAll parity checks passed.' : '\n' + fails + ' parity check(s) FAILED.');
process.exit(fails === 0 ? 0 : 1);
