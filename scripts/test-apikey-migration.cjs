// Harness: load the REAL built main.js with a stubbed 'obsidian' module and a fake keychain.
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

function make(secrets, data, opts = {}) {
  const store = new Map(Object.entries(secrets));
  const app = { secretStorage: {
    getSecret: (id) => store.has(id) ? store.get(id) : null,
    setSecret: (id, v) => { if (opts.failSet) throw new Error('boom'); if (opts.dropWrites) return; store.set(id, v); },
    listSecrets: () => [...store.keys()] } };
  const p = new Plugin(app, { id: 'emrald' });
  p.settings = Object.assign({ apiKey: '', apiKeySecretName: '', installId: 'ABCD-1234-ef', debugLogging: false }, data);
  p.saved = 0; p.saveData = async () => { p.saved++; };
  return { p, store };
}
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  // 1. clean upgrade
  let { p, store } = make({}, { apiKey: 'KEY-A' });
  notices.length = 0;
  await p.migrateApiKeyToSecretStorage();
  ok(store.get('emrald-api-key') === 'KEY-A', '1 secret written under default id');
  ok(p.settings.apiKey === '' && p.settings.apiKeySecretName === 'emrald-api-key', '1 legacy blanked, name set');
  ok(p.getApiKey() === 'KEY-A' && p.hasApiKey(), '1 resolver returns the key');
  ok(p.saved === 1 && notices.length === 1, '1 saved once, one notice');
  await p.migrateApiKeyToSecretStorage();
  ok(p.saved === 1 && notices.length === 1, '1b second run is a no-op');

  // 2. mobile collision: default id holds a DIFFERENT key (other vault)
  ({ p, store } = make({ 'emrald-api-key': 'KEY-OTHER' }, { apiKey: 'KEY-B' }));
  await p.migrateApiKeyToSecretStorage();
  ok(store.get('emrald-api-key') === 'KEY-OTHER', '2 other vault key untouched');
  ok(p.settings.apiKeySecretName === 'emrald-api-key-abcd1234' && store.get('emrald-api-key-abcd1234') === 'KEY-B', '2 per-install id used');
  ok(p.getApiKey() === 'KEY-B', '2 resolver returns this vault key');

  // 3. same key already in keychain under default id: reuse
  ({ p, store } = make({ 'emrald-api-key': 'KEY-C' }, { apiKey: 'KEY-C' }));
  await p.migrateApiKeyToSecretStorage();
  ok(p.settings.apiKeySecretName === 'emrald-api-key', '3 identical value reuses default id');

  // 4. setSecret throws: legacy key must survive
  ({ p, store } = make({}, { apiKey: 'KEY-D' }, { failSet: true }));
  await p.migrateApiKeyToSecretStorage();
  ok(p.settings.apiKey === 'KEY-D' && p.settings.apiKeySecretName === '' && p.getApiKey() === 'KEY-D', '4 failure keeps legacy key working');
  ok(p.saved === 0, '4 nothing saved on failure');

  // 5. setSecret silently drops the write: read-back guard must catch it
  ({ p, store } = make({}, { apiKey: 'KEY-E' }, { dropWrites: true }));
  await p.migrateApiKeyToSecretStorage();
  ok(p.settings.apiKey === 'KEY-E' && p.settings.apiKeySecretName === '', '5 failed read-back keeps legacy key');

  // 6. second device: name synced, secret absent, legacy blank
  ({ p, store } = make({}, { apiKey: '', apiKeySecretName: 'emrald-api-key' }));
  ok(p.getApiKey() === '' && !p.hasApiKey(), '6 second device reports no key');
  p.setApiKey('KEY-F');
  ok(store.get('emrald-api-key') === 'KEY-F' && p.getApiKey() === 'KEY-F' && p.settings.apiKey === '', '6 paste on second device lands in keychain only');

  // 7. fresh install, paste box
  ({ p, store } = make({}, {}));
  p.setApiKey('KEY-G');
  ok(p.settings.apiKeySecretName === 'emrald-api-key' && p.settings.apiKey === '' && p.getApiKey() === 'KEY-G', '7 fresh paste');
  p.setApiKey('KEY-H');
  ok(store.get('emrald-api-key') === 'KEY-H' && store.size === 1, '7 key replacement overwrites own secret');
  p.setApiKey('');
  ok(!p.hasApiKey(), '7 clearing the box clears the key');

  console.log(fails ? ('FAILURES: ' + fails) : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
