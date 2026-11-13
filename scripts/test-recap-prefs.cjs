// Recap preferences: startup PULLS the server schedule and never pushes it (Devon 11/13).
// Usage: node scripts/test-recap-prefs.cjs main.js
const Module = require('module');
const path = require('path');
const notices = [];
class Base { constructor(...a) { this.args = a; } }
const stub = new Proxy({}, {
  get(_, name) {
    if (name === '__esModule') return false;
    if (name === 'Notice') return class { constructor(m) { notices.push(m); } };
    if (name === 'Plugin') return class { constructor(app) { this.app = app; } };
    return Base;
  }
});
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'obsidian' ? stub : origLoad.call(this, req, ...rest); };
const mod = require(path.resolve(process.argv[2]));
const Plugin = mod.default || mod;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  const store = new Map([['emrald-api-key', 'KEY']]);
  const app = { secretStorage: { getSecret: (id) => store.get(id) ?? null, setSecret: (id, v) => store.set(id, v), listSecrets: () => [...store.keys()] } };
  const p = new Plugin(app, { id: 'emrald' });
  p.settings = { apiKey: '', apiKeySecretName: 'emrald-api-key', installId: 'ABCD-1234-ef', debugLogging: false, digestDay: 'sunday', digestTime: '09:00', researchOptIn: false };
  p.saved = 0; p.saveData = async () => { p.saved++; };
  let pushes = 0;
  p.apiClient = {
    getPreferences: async () => ({ data: { digest_day: 3, digest_time: '21:00:00', research_opt_in: true } }),
    updatePreferences: async () => { pushes++; return { data: {} }; }
  };
  await p.reconcilePreferences();
  ok(p.settings.digestDay === 'wednesday' && p.settings.digestTime === '21:00', 'server schedule pulled into local settings');
  ok(p.settings.researchOptIn === true, 'research opt-in still pulled');
  ok(pushes === 0, 'startup reconcile never pushes the schedule');
  ok(p.saved === 1, 'saved once');
  await p.reconcilePreferences();
  ok(p.saved === 1 && pushes === 0, 'second pull with no change does not save');
  p.apiClient.getPreferences = async () => ({ data: null });
  await p.reconcilePreferences();
  ok(p.settings.digestDay === 'wednesday', 'empty response leaves settings alone');
  console.log(fails ? 'FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
