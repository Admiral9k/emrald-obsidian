// Drives the REAL signup and questions flows (bundled from src/onboarding/onboarding.ts) and the REAL celebration modal
// (src/modals/celebration.ts) with a fake DOM and fake API. Checks the 1.4.3 ruleset:
//   signup = Connect, Welcome, First project, Ready; project required; one save on the Ready button;
//   questions: pages 4/5/4, nothing pre-answered, a blank is never saved; celebration uses the deck lines.
// usage: node scripts/test-onboarding-flow.cjs        (bundles with esbuild itself)
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const esbuild = require('esbuild');

const notices = [];
function fn() {}
const stub = new Proxy({}, {
  get(_, name) {
    if (name === '__esModule') return false;
    if (name === 'Notice') return class { constructor(m) { notices.push(m); } };
    if (name === 'Plugin') return class { constructor(app) { this.app = app; } };
    if (name === 'Modal') return class { constructor(app) { this.app = app; this.contentEl = new FakeEl('div'); this.modalEl = new FakeEl('div'); this.closed = 0; } close() { this.closed++; } open() { this.onOpen && this.onOpen(); } };
    if (name === 'FuzzySuggestModal') return class { constructor(app) { this.app = app; } };
    if (typeof name === 'string' && /^[a-z]/.test(name)) return fn;
    return class {};
  }
});
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'obsidian' ? stub : origLoad.call(this, req, ...rest); };

const timeouts = [];
global.window = { setTimeout: (f) => { timeouts.push(f); return 0; }, open: fn };
global.document = { createElement: () => new FakeEl('x') };
global.createDiv = (o) => new FakeEl('div', o);

class FakeEl {
  constructor(tag, opts = {}) {
    this.tag = tag; this.children = []; this.listeners = {}; this.cls = opts.cls || ''; this.text = opts.text || '';
    this.type = opts.type; this.placeholder = opts.placeholder; this.value = opts.value || ''; this.textContent = opts.text || '';
    this.className = this.cls; this.classes = new Set(String(this.cls).split(/\s+/).filter(Boolean)); this.disabled = false; this.attrs = {};
  }
  _add(tag, opts) { const e = new FakeEl(tag, opts || {}); this.children.push(e); return e; }
  createDiv(o) { return this._add('div', o); } createEl(t, o) { const e = this._add(t, o); if (o && o.value !== undefined && t === 'option') e.value = o.value; return e; } createSpan(o) { return this._add('span', o); }
  empty() { this.children = []; } addClass(...c) { c.forEach((x) => this.classes.add(x)); } removeClass(c) { this.classes.delete(c); } hasClass(c) { return this.classes.has(c); }
  appendText() {} setText(t) { this.textContent = t; this.text = t; } addEventListener(ev, cb) { (this.listeners[ev] ||= []).push(cb); }
  setAttribute(k, v) { this.attrs[k] = v; } insertBefore(n) { this.children.push(n); }
  querySelectorAll(sel) { if (!sel.startsWith('.')) return this.all().filter((e) => e !== this && e.tag === sel); const c = sel.replace('.', ''); return this.all().filter((e) => e !== this && e.classes.has(c)); }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  fire(ev, arg) { (this.listeners[ev] || []).forEach((f) => f(arg)); }
  texts() { return this.all().map((e) => e.text || e.textContent).filter(Boolean); }
}

function bundle(entry) {
  const out = path.join(os.tmpdir(), 'emrald-flow-' + path.basename(entry, '.ts') + '.cjs');
  esbuild.buildSync({ entryPoints: [path.resolve(__dirname, '..', entry)], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], outfile: out, logLevel: 'silent' });
  return require(out);
}
const { OnboardingModal } = bundle('src/onboarding/onboarding.ts');
const { CelebrationModal } = bundle('src/modals/celebration.ts');
const { COPY } = bundle('src/onboarding/copy.ts');
const settle = () => new Promise((r) => setTimeout(r, 20));

function setup(over = {}) {
  const calls = { createItem: [], avail: [], calib: [], recovery: [], saved: 0 };
  const p = {
    app: {}, settings: { onboardingComplete: false, researchOptIn: false }, calls, views: [],
    saveSettings: async () => { calls.saved++; },
    openWorkspaceView: async (v) => { p.views.push(v); },
    apiClient: {
      createItem: async (b) => { calls.createItem.push(b); return over.createItem ? over.createItem() : { data: { id: 'item-1' } }; },
      setWeeklyAvailability: async (h) => { calls.avail.push(h); return over.avail ? over.avail() : { data: null, error: null }; },
      updateCalibration: async (a) => { calls.calib.push(a); return over.calib ? over.calib() : { data: {}, error: null }; },
      createRecoveryProtocol: async (n) => { calls.recovery.push(n); return over.recovery ? over.recovery() : { data: {}, error: null }; },
      updatePreferences: async (b) => { calls.prefs = (calls.prefs || []).concat([b]); return over.prefs ? over.prefs() : { data: {}, error: null }; },
    },
  };
  return p;
}
function modalAt(p, step, mode = 'signup') {
  const m = new OnboardingModal(p.app, p, () => { p.completed = (p.completed || 0) + 1; }, mode);
  m.contentEl = new FakeEl('div');
  m.goTo(step);
  return m;
}
const root = (m) => m.contentEl;
const find = (m, text) => root(m).all().find((e) => (e.text || e.textContent) === text);

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };

(async () => {
  // A. signup order and no counter
  let p = setup();
  let m = new OnboardingModal(p.app, p, () => {});
  ok(m.currentStep === 'connect', 'A signup starts on Connect');
  m = modalAt(p, 'welcome');
  ok(find(m, COPY['welcome.title']) && find(m, COPY['welcome.cta']), 'A Welcome screen shows deck title and CTA');
  ok(!root(m).texts().some((t) => /Step \d|of 13|of \d/.test(t)), 'A no step counter on the signup screens');
  ok(['1', '2', '3', '4'].every((n) => find(m, COPY['welcome.bullets.' + n])), 'A four welcome bullets');

  // B. project is required; legend present; "for it" body
  m = modalAt(p, 'project');
  const next = find(m, 'Next');
  ok(next && next.disabled === true, 'B Next disabled until a project name is typed');
  ok(find(m, COPY['project.body']) && /for it:/.test(COPY['project.body']), 'B project body is the deck line');
  ok([1, 2, 3, 4].every((n) => find(m, COPY['project.legend.' + n])), 'B four legend lines (names with codes)');
  ok(find(m, COPY['project.required']) && find(m, COPY['project.noteLink']), 'B required hint and note-link tip shown');
  const nameIn = root(m).all().find((e) => e.placeholder === 'Project name');
  nameIn.value = 'My novel'; nameIn.fire('input');
  ok(next.disabled === false, 'B Next enabled once a name exists');
  next.fire('click');
  ok(m.currentStep === 'ready', 'B Next goes to Ready');

  // C. Ready: one save, on the button only
  ok(p.calls.createItem.length === 0 && p.calls.avail.length === 0, 'C nothing saved before the Ready button');
  m.projectName = 'My novel'; m.projectLevel = 'E3';
  m.goTo('ready');
  ok(!root(m).texts().some((t) => /Step \d/.test(t)) && find(m, COPY['ready.title']), 'C Ready screen, no counter');
  const hours = root(m).all().find((e) => e.type === 'number');
  ok(hours.value === '4', 'C hours default 4');
  hours.value = '6'; hours.fire('input');
  const go = find(m, COPY['ready.cta']);
  go.fire('click'); await settle(); timeouts.splice(0).forEach((f) => f());
  ok(p.calls.createItem.length === 1 && p.calls.createItem[0].name === 'My novel' && p.calls.createItem[0].effort_level === 'E3', 'C project created once with name and level');
  ok(p.calls.avail[0] === 6, 'C hours saved from the field');
  ok(p[ '_firstSessionItemId' ] === 'item-1', 'C first-session hand-off set for the sidebar');
  ok(p.settings.onboardingComplete === true && p.completed === 1, 'C onboarding marked done, callback fired');
  ok(!p.views.length, 'C About does not open when the first session starts');

  // D. create failure: nothing handed off, button usable again
  p = setup({ createItem: () => ({ error: 'boom' }) });
  m = modalAt(p, 'ready'); m.projectName = 'X'; m.goTo('ready');
  find(m, COPY['ready.cta']).fire('click'); await settle();
  ok(p._firstSessionItemId === undefined && p.settings.onboardingComplete === false, 'D failed create: no hand-off, not marked done');
  ok(find(m, COPY['ready.cta']).disabled === false, 'D button usable again');

  // E. questions: pages 4/5/4, nothing pre-answered, blank never saved
  p = setup();
  m = modalAt(p, 'questions', 'questions');
  ok(find(m, 'Questions 1\u20134 of 13'), 'E page 1 progress "Questions 1-4 of 13"');
  ok(root(m).all().filter((e) => e.classes.has('is-active')).length === 0, 'E nothing is pre-selected on page 1');
  find(m, 'Next').fire('click');
  ok(find(m, 'Questions 5\u20139 of 13'), 'E page 2 progress "Questions 5-9 of 13"');
  ok(root(m).all().filter((e) => e.classes.has('is-active')).length === 0, 'E nothing pre-selected on page 2 (scales start blank)');
  const scaleRows = root(m).all().filter((e) => e.classes.has('emerald-scale-row'));
  ok(scaleRows.length === 5 && scaleRows.every((r) => r.children.length === 5), 'E page 2 has five 5-point scales');
  find(m, 'Next').fire('click');
  ok(find(m, 'Questions 10\u201313 of 13'), 'E page 3 progress "Questions 10-13 of 13"');
  // skip with no answers saves nothing
  find(m, COPY['questions.skip']).fire('click'); await settle();
  ok(p.calls.calib.length === 0, 'E skipping with no answers writes nothing (blank never saved)');
  ok(m.currentStep === 'recharge', 'E goes on to Recharge');

  // F. one answered question saves only that key
  p = setup();
  m = modalAt(p, 'questions', 'questions'); find(m, 'Next').fire('click');
  const firstScale = root(m).all().find((e) => e.classes.has('emerald-scale-row'));
  firstScale.children[3].fire('click'); // pick 4
  ok(firstScale.children[3].classes.has('is-active') && firstScale.children[0].classes.has('is-active') === false, 'F pressed scale button is the only active one');
  find(m, 'Next').fire('click'); find(m, COPY['questions.skip']).fire('click'); await settle();
  const saved = p.calls.calib[0] || {};
  ok(Object.keys(saved).length === 1 && Object.values(saved)[0] === 4, 'F only the answered question is saved');

  // G. recharge with nothing typed, then done / close behavior
  m = modalAt(p, 'recharge', 'questions'); p.calls.recovery.length = 0;
  find(m, COPY['recharge.skip']).fire('click');
  ok(p.calls.recovery.length === 0, 'G skipping recharge saves nothing');
  m = modalAt(p, 'done', 'questions');
  const cb = root(m).all().find((e) => e.type === 'checkbox');
  ok(cb && cb.checked === false, 'G opt-in box starts unchecked');
  ok(root(m).texts().some((t) => t === COPY['card.done']), 'G done line is the deck line');

  // H. celebration
  const cm = new CelebrationModal({}, p, { itemName: 'x', sessionMinutes: 6, availableHours: 4 });
  cm.contentEl = new FakeEl('div'); cm.onOpen();
  const ct = cm.contentEl.texts();
  ok(ct.includes(COPY['cel.title']) && ct.includes(COPY['cel.win']) && ct.includes(COPY['cel.closer']) && ct.includes(COPY['cel.cta']), 'H celebration shows the deck title, win, closer and CTA');
  ok(['cel.numbers', 'cel.checkin', 'cel.burnout'].every((k) => ct.includes(COPY[k])), 'H three list lines from the deck');
  ok(!ct.some((t) => /budget|% of/i.test(t)), 'H no "budget" or percent line in the first celebration');

  // I. receipt form: zone question starts blank and is omitted when unanswered
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/modals/effort-receipt.ts'), 'utf8');
  ok(/flowOccurred: number \| null = null/.test(src) && /\.\.\.\(this\.flowOccurred !== null/.test(src), 'I receipt: zone answer starts null and is sent only when answered');

  // J. FAILED SAVES (the API client returns { error }, it does not throw)
  // J1. hours fail: stay on Ready, say so, retry does not create a second project
  p = setup({ avail: () => ({ data: null, error: 'HTTP 500' }) });
  m = modalAt(p, 'ready'); m.projectName = 'P'; m.goTo('ready');
  find(m, COPY['ready.cta']).fire('click'); await settle();
  ok(p.settings.onboardingComplete === false && p._firstSessionItemId === undefined, 'J1 hours save failed: not marked done, no hand-off');
  ok(root(m).texts().some((t) => /Could not save your hours/.test(t)), 'J1 the error is shown');
  find(m, COPY['ready.cta']).fire('click'); await settle();
  ok(p.calls.createItem.length === 1, 'J1 retry does not create a second project');
  // J2. questions save fails: stay on the page, show the error, answers still held
  p = setup({ calib: () => ({ data: null, error: 'HTTP 500' }) });
  m = modalAt(p, 'questions', 'questions'); m.answers = { sleep_quality_baseline: 4 }; m.qPage = 2; m.goTo('questions');
  find(m, COPY['questions.skip']).fire('click'); await settle();
  ok(m.currentStep === 'questions' && root(m).texts().some((t) => /Could not save your answers/.test(t)), 'J2 failed answers save stays on the page with the error');
  ok(m.answers.sleep_quality_baseline === 4 && m.savedSomething === false, 'J2 answers kept, nothing claimed as saved');
  // J3. a queued (offline) write counts as saved
  p = setup({ calib: () => ({ data: null, error: null, queued: true }) });
  m = modalAt(p, 'questions', 'questions'); m.answers = { sleep_quality_baseline: 4 }; m.qPage = 2; m.goTo('questions');
  find(m, COPY['questions.skip']).fire('click'); await settle();
  ok(m.currentStep === 'recharge' && m.savedSomething === true, 'J3 queued write moves on');
  // J4. recharge fails: stay, nothing claimed
  p = setup({ recovery: () => ({ data: null, error: 'HTTP 500' }) });
  m = modalAt(p, 'recharge', 'questions');
  root(m).all().find((e) => e.placeholder && /Walking/.test(e.placeholder)).value = 'Walking';
  find(m, 'Next').fire('click'); await settle();
  ok(m.currentStep === 'recharge' && m.savedSomething === false && m.closed !== 1 && root(m).texts().some((t) => /Could not save that/.test(t)), 'J4 failed recharge save stays with the error');
  // J5. opt-in fails: checkbox shows what is really saved, setting unchanged
  p = setup({ prefs: () => ({ data: null, error: 'HTTP 500' }) });
  m = modalAt(p, 'done', 'questions');
  const box = root(m).all().find((e) => e.type === 'checkbox'); box.checked = true; box.fire('change'); await settle();
  ok(box.checked === false && p.settings.researchOptIn === false && notices.some((n) => /Could not save that choice/.test(n)), 'J5 failed opt-in reverts the box and tells the user');
  box.checked = true; p.apiClient.updatePreferences = async () => ({ data: {}, error: null }); box.fire('change'); await settle();
  ok(p.settings.researchOptIn === true, 'J5 a good save sticks');

  // K. closing
  // K1. Esc while the Ready save is in flight: close steps run ONCE (after the save), About never opens over the session
  p = setup(); let release; p.apiClient.createItem = () => new Promise((res) => { release = () => res({ data: { id: 'item-9' }, error: null }); });
  m = modalAt(p, 'ready'); m.projectName = 'P'; m.goTo('ready');
  find(m, COPY['ready.cta']).fire('click'); await settle();
  m.onClose(); // Esc pressed mid-save
  timeouts.splice(0).forEach((f) => f());
  ok(!p.completed && !p.views.length && p.settings.onboardingComplete === false, 'K1 Esc mid-save runs no close steps yet');
  release(); await settle(); await settle(); timeouts.splice(0).forEach((f) => f());
  ok(p.completed === 1 && p.views.length === 0 && p.settings.onboardingComplete === true && p._firstSessionItemId === 'item-9', 'K1 after the save: completion once, no About, first session handed off');
  ok(m.closed === 0, 'K1 finish does not close an already closed modal again');
  // K2. questions mode tells its opener to refresh when it closes
  p = setup(); m = modalAt(p, 'questions', 'questions'); m.onClose();
  ok(p.completed === 1, 'K2 questions mode fires the completion callback on close (Effort Profile refreshes)');

  console.log(fails ? ('FAILURES: ' + fails) : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
