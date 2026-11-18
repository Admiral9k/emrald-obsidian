// One-answer editor (1.4.4): the DOM-free model and the modal, driven with a fake DOM.
// Run:  node scripts/test-answer-edit.cjs   (no arguments; bundles the sources itself)
const path = require('path');
const os = require('os');
const Module = require('module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
function bundle(entry, name) {
  const out = path.join(os.tmpdir(), name);
  esbuild.buildSync({ entryPoints: [path.join(root, entry)], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], outfile: out, logLevel: 'silent' });
  return out;
}

// ── fake DOM: just enough of Obsidian's element helpers ──
class El {
  constructor(tag, opts) {
    this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.classes = new Set();
    this.text = ''; this.disabled = false; this.value = ''; this.rows = 0; this.maxLength = 0; this.tabIndex = -1;
    if (opts && opts.cls) String(opts.cls).split(/\s+/).filter(Boolean).forEach((c) => this.classes.add(c));
    if (opts && opts.text !== undefined) this.text = String(opts.text);
  }
  createEl(tag, opts) { const e = new El(tag, opts); this.children.push(e); return e; }
  createDiv(opts) { return this.createEl('div', opts); }
  createSpan(opts) { return this.createEl('span', opts); }
  appendText(t) { this.text += t; }
  setText(t) { this.text = t; }
  empty() { this.children = []; this.text = ''; }
  addClass(c) { String(c).split(/\s+/).filter(Boolean).forEach((x) => this.classes.add(x)); }
  removeClass(c) { this.classes.delete(c); }
  hasClass(c) { return this.classes.has(c); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  click() { if (this.disabled) return; (this.listeners.click || []).forEach((f) => f({})); }
  input(v) { this.value = v; (this.listeners.input || []).forEach((f) => f({})); }
  all(sel) {
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const out = [];
    const walk = (e) => { for (const c of e.children) { if (!cls || c.classes.has(cls)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelectorAll(sel) { return this.all(sel); }
  textDeep() { return this.text + this.children.map((c) => c.textDeep()).join(' '); }
}

class Modal { constructor(app) { this.app = app; this.contentEl = new El('div'); this.closed = false; } close() { this.closed = true; this.onClose && this.onClose(); } }
const stub = new Proxy({}, { get: (_, n) => (n === '__esModule' ? false : n === 'Modal' ? Modal : class {}) });
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'obsidian' ? stub : orig.call(this, req, ...rest); };

const M = require(bundle('src/modals/answer-edit-model.ts', 'emrald-answer-edit-model.cjs'));
const { AnswerEditModal } = require(bundle('src/modals/answer-edit.ts', 'emrald-answer-edit.cjs'));

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// ── model ──
const keys = Object.keys(M.EDITABLE_BY_KEY);
ok(keys.length === 42, 'every profile answer is editable: 13 simple + 29 advanced (the web lists the same 29) = ' + keys.length);
ok(['chronotype', 'procrastination_tendency', 'flow_activities', 'imported_clifton_top5', 'impulsiveness'].every((k) => k in M.EDITABLE_BY_KEY), 'spot keys present (simple, advanced slider, advanced text)');
ok(M.EDITABLE_BY_KEY.conscientiousness.low === 'Disagree' && M.EDITABLE_BY_KEY.conscientiousness.high === 'Agree', 'statement questions end on Disagree / Agree');
ok(M.EDITABLE_BY_KEY.procrastination_tendency.low === 'Rarely' && M.EDITABLE_BY_KEY.procrastination_tendency.high === 'Often', 'procrastination ends on Rarely / Often');
ok(M.EDITABLE_BY_KEY.impulsiveness.kind === 'scale' && M.EDITABLE_BY_KEY.impulsiveness.high === 'Very often', 'an advanced slider is a 1 to 5 scale with its own end labels');
ok(M.EDITABLE_BY_KEY.flow_activities.kind === 'text', 'advanced text answers edit as text');
ok(M.EDITABLE_BY_KEY.chronotype.options.some((o) => o.value === 'very_early'), 'chronotype offers Very early');

ok(M.canSave(undefined, 3) === false, 'nothing picked: no save');
ok(M.canSave(3, 3) === false, 'same as the saved answer: no save');
ok(M.canSave(4, 3) === true, 'a different scale answer saves');
ok(M.canSave('  ', 'x') === false && M.canSave('', 'x') === false, 'blank text cannot be saved (an answer is changed, never cleared)');
ok(M.canSave('new', undefined) === true, 'text where there was none saves');
ok(M.valueToSave(M.EDITABLE_BY_KEY.flow_activities, '  walks  ') === 'walks', 'text is trimmed');
ok(M.valueToSave(M.EDITABLE_BY_KEY.chronotype, 'evening') === 'evening', 'an option goes as picked');

const cmp = (reason, observed) => ({ key: 'x', metric_key: 'D19', status: 'mild_mismatch', severity: 1, reported: 3, observed: observed ?? null, reason });
ok(M.directionHint('procrastination_tendency', cmp('reports_more_than_observed')) === 'Your recent sessions show you starting sooner than this answer says.', 'procrastination hint (reports more)');
ok(M.directionHint('procrastination_tendency', cmp('observed_more_than_reports')) === 'Your recent sessions show you starting later than this answer says.', 'procrastination hint (observed more)');
ok(M.directionHint('stress_vulnerability', cmp('reports_more_than_observed')) === 'Your recent sessions show fewer burnout signals than this answer says.', 'stress hint (reports more)');
ok(M.directionHint('stress_vulnerability', cmp('observed_more_than_reports')) === 'Your recent sessions show more burnout signals than this answer says.', 'stress hint (observed more)');
ok(M.directionHint('working_genius_primary', cmp('tenacity_vs_completion')) === 'Your recent completion rate runs lower than a finishing-first answer suggests.', 'working genius hint');
ok(M.directionHint('chronotype', cmp('x', 'peak hours in the evening')) === 'Your recent sessions show peak hours in the evening.', 'chronotype hint names the observation');
ok(M.directionHint('chronotype', cmp('x', null)) === null, 'chronotype hint stays quiet with no observation');
ok(M.directionHint('impulsiveness', cmp('reports_more_than_observed')) === null, 'an unflagged-kind question gets no hint');
ok(M.directionHint('procrastination_tendency', undefined) === null, 'no comparison: no hint');
const hints = ['procrastination_tendency', 'stress_vulnerability', 'working_genius_primary', 'chronotype'].flatMap((k) => ['reports_more_than_observed', 'observed_more_than_reports', 'tenacity_vs_completion'].map((r) => M.directionHint(k, cmp(r, 'a late peak')))).filter(Boolean);
ok(hints.every((h) => !/\u2014/.test(h) && !/\b(should|try|pick|choose)\b/i.test(h)), 'hints never carry an em-dash or tell the user what to pick (' + hints.length + ' strings)');

// ── modal ──
function open(qkey, current, hint, api) {
  const saved = []; let onSaved = 0;
  const plugin = { apiClient: { updateCalibration: async (a) => { saved.push(a); return api ? api(a) : { data: {}, error: null }; } } };
  const m = new AnswerEditModal({}, plugin, qkey, current, hint, () => { onSaved++; });
  m.onOpen();
  const find = (cls) => m.contentEl.all('.' + cls);
  const btnByText = (t) => m.contentEl.all('.emerald-btn').find((b) => b.text === t);
  return { m, saved, find, btnByText, saves: () => onSaved };
}
(async () => {
  // scale question, saved answer 3
  let t = open('conscientiousness', 3, 'Your recent sessions show fewer burnout signals than this answer says.');
  const scale = t.find('emerald-scale-btn');
  ok(scale.length === 5, 'scale shows five buttons');
  ok(scale[2].hasClass('is-active') && scale[2].attrs['aria-checked'] === 'true', 'the saved answer comes up selected');
  ok(t.find('emerald-ae-current-tag').length === 1 && t.find('emerald-ae-current-tag')[0].text === 'Current answer', 'the current answer carries the tag');
  ok(t.find('emerald-ae-hint').length === 1, 'the hint shows under the question');
  ok(t.btnByText('Save answer').disabled === true, 'Save is off until the answer changes');
  scale[3].click();
  ok(t.btnByText('Save answer').disabled === false && scale[3].hasClass('is-active') && !scale[2].hasClass('is-active'), 'picking another value turns Save on and moves the selection');
  await (t.btnByText('Save answer').listeners.click[0]());
  ok(t.saved.length === 1 && JSON.stringify(t.saved[0]) === '{"conscientiousness":4}', 'saves ONLY this key: ' + JSON.stringify(t.saved[0]));
  ok(t.m.closed && t.saves() === 1, 'success closes the modal and refreshes the view');

  // failure keeps the modal open with the message and the pick
  t = open('chronotype', 'evening', null, () => ({ error: 'HTTP 500' }));
  const opts = t.find('emerald-onboard-enum-btn');
  ok(opts.length === 6 && opts[4].hasClass('is-active'), 'enum shows every option with the saved one selected');
  ok(t.find('emerald-ae-hint').length === 0, 'no hint when the question is not flagged');
  opts[1].click();
  await (t.btnByText('Save answer').listeners.click[0]());
  const err = t.m.contentEl.all('.is-error')[0];
  ok(!t.m.closed && t.saves() === 0 && !err.hasClass('emrald-hidden') && err.text === 'Could not save your answer. Try again.', 'a failed save shows the error and stays open');
  ok(t.btnByText('Save answer').disabled === false, 'Save comes back on after a failure so the user can retry');

  // queued (offline) write counts as saved
  t = open('chronotype', 'evening', null, () => ({ error: 'offline', queued: true }));
  t.find('emerald-onboard-enum-btn')[0].click();
  await (t.btnByText('Save answer').listeners.click[0]());
  ok(t.m.closed && t.saves() === 1, 'a queued offline write counts as saved');

  // a thrown error is also a failure
  t = open('chronotype', 'evening', null, () => { throw new Error('boom'); });
  t.find('emerald-onboard-enum-btn')[0].click();
  await (t.btnByText('Save answer').listeners.click[0]());
  ok(!t.m.closed && t.saves() === 0, 'a thrown error is a failure, not a success');

  // text question
  t = open('flow_activities', 'long walks');
  const area = t.m.contentEl.all('.emerald-ae-text')[0];
  ok(area.maxLength === 500 && area.value === 'long walks', 'text answer comes up filled, capped at 500');
  area.input('   ');
  ok(t.btnByText('Save answer').disabled === true, 'blank text cannot be saved');
  area.input('  reading in the library ');
  await (t.btnByText('Save answer').listeners.click[0]());
  ok(JSON.stringify(t.saved[0]) === '{"flow_activities":"reading in the library"}', 'text saves trimmed: ' + JSON.stringify(t.saved[0]));

  // a work-type option carries its description
  t = open('working_genius_primary', 'tenacity');
  ok(t.find('emerald-opt-desc').length === 6, 'work-type options show their description');

  // unknown key closes quietly
  t = open('not_a_question', 1);
  ok(t.m.closed, 'an unknown key closes without drawing');

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' check(s) FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
