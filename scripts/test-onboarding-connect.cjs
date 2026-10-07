// Drives the REAL OnboardingModal connect step (bundled from src/onboarding/onboarding.ts)
// against the REAL plugin methods (built main.js), with a fake DOM, fake API and fake keychain.
// usage: npx esbuild src/onboarding/onboarding.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=<bundle.cjs>
//        node scripts/test-onboarding-connect.cjs main.js <bundle.cjs>
const Module = require('module');
const path = require('path');

const notices = [];
function fn() {}
const stub = new Proxy({}, {
  get(_, name) {
    if (name === '__esModule') return false;
    if (name === 'Notice') return class { constructor(m) { notices.push(m); } };
    if (name === 'Plugin') return class { constructor(app) { this.app = app; } };
    if (name === 'Modal') return class { constructor(app) { this.app = app; this.contentEl = new FakeEl('div'); this.modalEl = new FakeEl('div'); } };
    if (typeof name === 'string' && /^[a-z]/.test(name)) return fn; // helper functions (setIcon...)
    return class {};
  }
});
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'obsidian' ? stub : origLoad.call(this, req, ...rest); };

const timeouts = [];
global.window = { setTimeout: (f, ms) => { timeouts.push(f); return 0; }, open: fn };
global.document = { createElement: () => new FakeEl('x') };

class FakeEl {
  constructor(tag, opts = {}) {
    this.tag = tag; this.children = []; this.listeners = {}; this.cls = opts.cls || ''; this.text = opts.text || '';
    this.type = opts.type; this.placeholder = opts.placeholder; this.value = opts.value || ''; this.textContent = opts.text || '';
    this.className = this.cls; this.href = opts.href; this.classes = new Set();
  }
  _add(tag, opts) { const e = new FakeEl(tag, opts || {}); this.children.push(e); return e; }
  createDiv(o) { return this._add('div', o); } createEl(t, o) { return this._add(t, o); } createSpan(o) { return this._add('span', o); }
  empty() { this.children = []; } addClass(c) { this.classes.add(c); } removeClass(c) { this.classes.delete(c); } hasClass(c) { return this.classes.has(c); }
  appendText() {} setText(t) { this.textContent = t; } addEventListener(ev, cb) { (this.listeners[ev] ||= []).push(cb); }
  all() { return [this, ...this.children.flatMap(c => c.all())]; }
}

const Plugin = (require(path.resolve(process.argv[2])).default);
const { OnboardingModal } = require(path.resolve(process.argv[3]));

function setup({ secrets = {}, data = {}, test = {}, items = { data: [] } }) {
  const store = new Map(Object.entries(secrets));
  const app = { secretStorage: {
    getSecret: id => store.has(id) ? store.get(id) : null,
    setSecret: (id, v) => { store.set(id, v); }, listSecrets: () => [...store.keys()] } };
  const p = new Plugin(app, { id: 'emrald' });
  p.settings = Object.assign({ apiKey: '', apiKeySecretName: '', apiUrl: 'https://api.effortmastery.com/v1', installId: 'abcd1234',
    activeFolderPath: 'Active', inactiveFolderPath: 'Inactive', onboardingComplete: false, debugLogging: false }, data);
  p.saved = 0; p.saveData = async () => { p.saved++; };
  p.creds = []; p.syncStarted = 0;
  p.apiClient = { updateCredentials: (k, u) => p.creds.push([k, u]), testConnection: async () => test, getItems: async () => items };
  p.folderSync = { updateConfig() {} }; p.stopSync = () => {}; p.startSync = () => { p.syncStarted++; };
  return { p, store };
}
const settle = () => new Promise(r => setTimeout(r, 30));
async function runConnect(p, typedKey) {
  const modal = new OnboardingModal(p.app, p, () => {});
  const root = new FakeEl('div');
  modal.renderConnect(root);
  const els = root.all();
  const input = els.find(e => e.placeholder === 'em_...');
  input.value = typedKey; (input.listeners.input || []).forEach(f => f());
  const btn = els.find(e => e.text === 'Test connection');
  btn.listeners.click.forEach(f => f());
  await settle();
  const status = els.find(e => String(e.className).startsWith('emerald-onboard-status'));
  return { modal, status, input };
}

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  // A. fresh install, valid key, new account
  let { p, store } = setup({});
  let r = await runConnect(p, 'KEY-NEW');
  ok(r.status.textContent === 'Connected!', 'A status Connected!');
  ok(store.get('emrald-api-key') === 'KEY-NEW', 'A key stored in keychain');
  ok(p.settings.apiKey === '' && p.settings.apiKeySecretName === 'emrald-api-key', 'A data.json side: no plaintext, name set');
  ok(p.saved >= 1, 'A settings persisted');
  ok(p.creds.at(-1)[0] === 'KEY-NEW', 'A API client holds the key resolved from the keychain');
  ok(p.syncStarted === 1, 'A sync started (hasApiKey true)');
  ok(r.modal.currentStep === 'welcome' && timeouts.length === 1, 'A advance to next step scheduled');
  timeouts.length = 0;

  // B. wrong key
  ({ p, store } = setup({ test: { error: 'Unauthorized' } }));
  r = await runConnect(p, 'KEY-BAD');
  ok(/Connection failed/.test(r.status.textContent), 'B shows connection failed');
  ok(store.size === 0 && p.settings.apiKey === '' && p.settings.apiKeySecretName === '', 'B nothing stored anywhere');
  ok(p.saved === 0 && p.syncStarted === 0, 'B nothing persisted, sync not started');

  // C. empty key
  ({ p, store } = setup({}));
  r = await runConnect(p, '   ');
  ok(r.status.textContent === 'Please enter an API key' && store.size === 0, 'C empty key rejected, nothing stored');

  // D. returning user (account already has items)
  ({ p, store } = setup({ items: { data: [{ id: 1 }] } }));
  r = await runConnect(p, 'KEY-RET');
  ok(r.modal.isNewUser === false && store.get('emrald-api-key') === 'KEY-RET', 'D returning user detected, key stored');
  timeouts.length = 0;

  // E. re-run onboarding on a vault that already migrated: replaces own secret, no second id
  ({ p, store } = setup({ secrets: { 'emrald-api-key': 'KEY-OLD' }, data: { apiKeySecretName: 'emrald-api-key' } }));
  r = await runConnect(p, 'KEY-REPLACED');
  ok(store.get('emrald-api-key') === 'KEY-REPLACED' && store.size === 1, 'E re-run overwrites own secret only');
  timeouts.length = 0;

  // F. re-run onboarding with a WRONG key while a good key exists: what does the live client hold afterwards?
  ({ p, store } = setup({ secrets: { 'emrald-api-key': 'KEY-GOOD' }, data: { apiKeySecretName: 'emrald-api-key' }, test: { error: 'Unauthorized' } }));
  r = await runConnect(p, 'KEY-BAD');
  ok(store.get('emrald-api-key') === 'KEY-GOOD', 'F good key untouched in keychain');
  ok(p.creds.at(-1)[0] === 'KEY-GOOD', 'F live client falls back to the saved key after a failed test');

  console.log(fails ? ('FAILURES: ' + fails) : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
