// Drives the REAL receipt graph (bundled from src/) with a fake DOM and a fake API.
// usage: node scripts/test-receipt-graph.cjs [path/to/Emrald-freed-main/src/lib/ReceiptGraph.svelte]
// The optional web file is the parity spec: zones, legend text, labels and wording are compared to it.
// Covers: zone + legend parity with the web twin, paging and range params, narrow-pane count, empty and
// error states with retry, keyboard (arrows, Enter, Esc), nearest-dot click, stale-response guard,
// the client's envelope handling (total survives), and the E-level overview wiring (button, inline row,
// one panel at a time, close, rebuild on filter).
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(process.env.TMPDIR ? process.env.TMPDIR : os.tmpdir(), 'rg-test-'));
function bundle(entry, name) {
  const outfile = path.join(out, name);
  esbuild.buildSync({ entryPoints: [path.join(root, entry)], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], outfile, logLevel: 'error' });
  return outfile;
}

// ── Fake DOM ──
const events = { docListeners: [], docRemoved: 0 };
class FakeEl {
  constructor(tag, opts = {}, ns) {
    this.tag = tag; this.children = []; this.parent = null; this.listeners = {}; this.classes = new Set(); this.attrs = {};
    this.text = ''; this.disabled = false; this.clientWidth = 0; this.ns = ns; this.dataset = {}; this.style = {};
    if (typeof opts === 'string') opts = { cls: opts };
    if (opts.cls) String(opts.cls).split(/\s+/).filter(Boolean).forEach((c) => this.classes.add(c));
    if (opts.text != null) this.text = String(opts.text);
    if (opts.attr) for (const [k, v] of Object.entries(opts.attr)) this.attrs[k] = String(v);
    this.ownerDocument = FakeEl.doc;
    if (this.classes.has('emerald-rg-panel')) this.clientWidth = FakeEl.panelWidth;
  }
  _add(tag, o, ns) { const e = new FakeEl(tag, o || {}, ns); e.parent = this; this.children.push(e); return e; }
  createDiv(o) { return this._add('div', o); } createEl(t, o) { return this._add(t, o); } createSpan(o) { return this._add('span', o); }
  // Obsidian's createSvg does classList.add(cls): a string with a space throws InvalidCharacterError (arrays are fine). Mirror that.
  createSvg(t, o) {
    const c = typeof o === 'string' ? o : o && o.cls;
    if (typeof c === 'string' && /\s/.test(c)) throw new Error('InvalidCharacterError: createSvg cls must be one token or an array: ' + c);
    return this._add(t, o, 'svg');
  }
  empty() { this.children = []; this.text = ''; }
  addClass(c) { this.classes.add(c); } removeClass(c) { this.classes.delete(c); } hasClass(c) { return this.classes.has(c); }
  toggleClass(c, on) { on ? this.classes.add(c) : this.classes.delete(c); }
  appendText(t) { this.text += t; } setText(t) { this.text = String(t); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(ev, cb) { (this.listeners[ev] ||= []).push(cb); }
  dispatch(ev, obj = {}) { const e = Object.assign({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, obj); (this.listeners[ev] || []).forEach((f) => f(e)); return e; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  querySelectorAll(sel) {
    const m = sel.match(/^\[([\w-]+)\]$/); const cm = sel.match(/^\.([\w-]+)$/);
    return this.all().slice(1).filter((e) => (m ? m[1] in e.attrs : cm ? e.classes.has(cm[1]) : false));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(el) { return this.all().includes(el); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  after(el) { const p = this.parent; el.parent = p; const i = p.children.indexOf(this); p.children.splice(i + 1, 0, el); }
  focus() { FakeEl.doc.activeElement = this; }
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 0, width: this.clientWidth || 600, top: 0, height: 240 }; }
  get cls() { return [...this.classes].join(' '); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
}
FakeEl.panelWidth = 900;
FakeEl.doc = {
  activeElement: null,
  addEventListener(ev, cb) { if (ev === 'keydown') events.docListeners.push(cb); },
  removeEventListener(ev, cb) { const i = events.docListeners.indexOf(cb); if (i >= 0) { events.docListeners.splice(i, 1); events.docRemoved++; } }
};
global.createEl = (t, o) => new FakeEl(t, o || {});
global.createDiv = (o) => new FakeEl('div', o || {});
global.ResizeObserver = undefined; // the panel must work without one (and the harness redraws by hand)

// ── obsidian stub ──
const notices = [];
const obsidianStub = new Proxy({}, {
  get(_, name) {
    if (name === '__esModule') return false;
    if (name === 'Notice') return class { constructor(m) { notices.push(m); } };
    if (name === 'ItemView') return class { constructor(leaf) { this.leaf = leaf; this.containerEl = new FakeEl('div'); this.containerEl.children = [new FakeEl('div'), new FakeEl('div')]; } getViewType() { return ''; } };
    if (name === 'requestUrl') return (p) => global.__requestUrl(p);
    if (typeof name === 'string' && /^[a-z]/.test(name)) return () => {};
    return class {};
  }
});
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'obsidian' ? obsidianStub : origLoad.call(this, req, ...rest); };
global.window = { setTimeout: (f) => { f(); return 0; }, clearTimeout() {}, localStorage: { getItem: () => null, setItem() {} } };

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const settle = () => new Promise((r) => setTimeout(r, 15));

// ── Fixtures ──
function rcpt(i, over = {}) {
  const d = new Date(Date.UTC(2026, 9, 1 + i, 15, 0, 0)).toISOString();
  return Object.assign({ id: `r${i}`, created_at: d, perceived_effort: (i % 10) + 1, demand_investment_balance: ((i + 3) % 10) + 1, hedonic_valence: ((i + 5) % 10) + 1, flow_occurred: i % 3, verification_share: null, unexpected_complications: null, work_type: null, ai_summary: null, ai_authored: null, ai_edited_by_user: null, session: { started_at: d, duration_minutes: 30 + i } }, over);
}
// API is newest first
function fakeApi(all, log = []) {
  return {
    log,
    async getProjectReceipts(itemId, o = {}) {
      log.push({ itemId, ...o });
      const newestFirst = all.slice().reverse();
      let list = newestFirst;
      if (o.from) list = list.filter((r) => r.created_at >= o.from);
      const off = o.offset || 0; const lim = o.limit || 50;
      return { data: { data: list.slice(off, off + lim), total: list.length }, error: null, status: 200 };
    }
  };
}

(async () => {
  const model = require(bundle('src/views/workspace/receipt-graph-model.ts', 'model.cjs'));
  const { mountReceiptGraph } = require(bundle('src/views/workspace/receipt-graph.ts', 'panel.cjs'));
  const { METRICS, zoneOf, zoneSpans, loadProjectReceipts, wantedCount, chartLabel } = model;

  // 1. Parity with the web twin (zones, legend, labels, ranges)
  const webPath = process.argv[2];
  if (webPath && fs.existsSync(webPath)) {
    const src = fs.readFileSync(webPath, 'utf8');
    const a = src.indexOf('const METRICS: Metric[] = ['); const b = src.indexOf('const DEFAULT_COUNT');
    const ts = src.slice(a, b);
    const js = esbuild.transformSync('type Zone = "good"|"caution"|"risk"; interface Metric { key: string }\n' + ts + '\nexport { METRICS, RANGES, zoneOf, zoneSpans, ZONE_NAME };', { loader: 'ts', format: 'cjs' }).code;
    const m = { exports: {} }; new Function('module', 'exports', js)(m, m.exports);
    const web = m.exports;
    ok(JSON.stringify(web.METRICS) === JSON.stringify(METRICS), 'parity: METRICS (labels, questions, ranges, words) identical to the web file');
    ok(JSON.stringify(web.RANGES) === JSON.stringify(model.RANGES), 'parity: range chips identical');
    ok(JSON.stringify(web.ZONE_NAME) === JSON.stringify(model.ZONE_NAME), 'parity: zone names identical');
    let zoneBad = 0;
    for (const mt of METRICS) for (let v = mt.min; v <= mt.max; v++) if (web.zoneOf(mt, v) !== zoneOf(mt, v)) zoneBad++;
    ok(zoneBad === 0, 'parity: zoneOf agrees with the web file for every value of every metric');
    ok(METRICS.every((mt) => JSON.stringify(web.zoneSpans(mt)) === JSON.stringify(zoneSpans(mt))), 'parity: legend spans identical for all six metrics');
  } else {
    console.log('SKIP parity (no web file path given)');
  }
  const legend = (key) => zoneSpans(METRICS.find((x) => x.key === key)).map((s) => `${s.named ? s.zone + ' ' : ''}${s.text}`).join(' | ');
  ok(legend('perceived_effort') === 'good 1-4 | caution 5-7 | risk 8-10', 'legend How hard: ' + legend('perceived_effort'));
  ok(legend('demand_investment_balance') === 'good 5-6 | caution 3-4 and 7-8 | risk 1-2 and 9-10', 'legend Right amount of effort: ' + legend('demand_investment_balance'));
  ok(legend('hedonic_valence') === 'good 6-10 | caution 3-5 | risk 1-2', 'legend How enjoyable: ' + legend('hedonic_valence'));
  ok(legend('flow_occurred') === 'No | Somewhat | Yes', 'legend Flow state shows only the receipt words');
  ok(legend('verification_share') === '', 'AI verification has no zones (neutral blue)');
  ok(zoneOf(METRICS[3], 0) === 'risk' && zoneOf(METRICS[3], 2) === 'good', 'flow 0 = risk, 2 = good');
  ok(zoneOf(METRICS[5], 0) === 'good' && zoneOf(METRICS[5], 2) === 'risk', 'complications 0 = good, 2 = risk');
  ok(wantedCount(false, 900) === 50 && wantedCount(false, 700) === 20 && wantedCount(true, 300) === 500 && wantedCount(false, 0) === 50, 'wantedCount: 50 wide, 20 narrow (<=720), 500 on Show all');
  ok(chartLabel(METRICS[0], [rcpt(2), rcpt(7)]) === '2 receipts, How hard, range 3 to 8', 'chart text alternative reads like the spec');

  // 2. Loader: paging, range, errors
  {
    const all = Array.from({ length: 130 }, (_, i) => rcpt(i));
    const api = fakeApi(all);
    const r1 = await loadProjectReceipts(api, 'P1', 'all', 500);
    ok(r1.rows.length === 130 && r1.total === 130, 'loader pages 100 + 30 and returns all 130');
    ok(api.log.length === 2 && api.log[0].limit === 100 && api.log[0].offset === 0 && api.log[1].offset === 100, 'loader page params (limit, offset): ' + JSON.stringify(api.log.map((l) => [l.limit, l.offset])));
    ok(r1.rows[0].id === 'r0' && r1.rows[129].id === 'r129', 'loader returns oldest first');
    const api2 = fakeApi(all);
    const r2 = await loadProjectReceipts(api2, 'P1', 'all', 50);
    ok(r2.rows.length === 50 && r2.total === 130 && r2.rows[49].id === 'r129', 'newest 50 of 130, total kept');
    const api3 = fakeApi(all);
    const now = Date.UTC(2026, 9, 20);
    await loadProjectReceipts(api3, 'P1', 7, 50, now);
    ok(api3.log[0].from === new Date(now - 7 * 86400000).toISOString(), 'range 7 days maps to the API from param');
    let msg = '';
    try { await loadProjectReceipts({ getProjectReceipts: async () => ({ data: null, error: 'boom', status: 500 }) }, 'P', 'all', 10); } catch (e) { msg = e.message; }
    ok(msg === 'boom', 'loader surfaces the API error text');
    msg = '';
    try { await loadProjectReceipts({ getProjectReceipts: async () => ({ data: null, error: null, status: 0 }) }, 'P', 'all', 10); } catch (e) { msg = e.message; }
    ok(/Offline/.test(msg), 'loader says offline on status 0');
    const num = model.normalizeReceipt(rcpt(1, { perceived_effort: '7.50', flow_occurred: null, verification_share: '' }));
    ok(num.perceived_effort === 7.5 && num.flow_occurred === null && num.verification_share === null, 'numeric strings normalize; null and empty stay gaps');
  }

  // 3. Panel
  function mount(api, extra = {}) {
    const host = new FakeEl('td'); host.clientWidth = extra.width ?? 900;
    let closed = 0;
    FakeEl.panelWidth = extra.width ?? 900; // the panel is measured at load time (attached to the page in Obsidian)
    const h = mountReceiptGraph(host, { api, itemId: 'P1', itemName: extra.name || 'Alpha', onClose: () => { closed++; } });
    const panel = host.children[0];
    return { host, panel, h, closed: () => closed };
  }
  const byText = (panel, t, tag) => panel.all().filter((e) => e.text === t && (!tag || e.tag === tag));
  {
    const all = Array.from({ length: 12 }, (_, i) => rcpt(i, i === 11 ? { ai_summary: 'Wrote the spec.', ai_authored: true, ai_edited_by_user: true, work_type: 'Writing' } : {}));
    const api = fakeApi(all);
    const { host, panel, h } = mount(api);
    await settle();
    ok(panel.getAttribute('aria-label') === 'Receipt graph for Alpha', 'panel aria-label names the project');
    ok(api.log[0].itemId === 'P1' && api.log[0].limit === 50 && api.log[0].offset === 0, 'first load: item_id, newest 50');
    const chips = panel.all().filter((e) => e.classes.has('emerald-rg-chip'));
    ok(['How hard', 'Right amount of effort', 'How enjoyable', 'Flow state', 'AI verification', 'Any complications', 'All', '7 days', '14 days', '30 days', '60 days'].every((t) => chips.some((c) => c.text === t)), 'six value chips and five range chips present');
    ok(chips.find((c) => c.text === 'AI verification').hasClass('is-muted') && !chips.find((c) => c.text === 'How hard').hasClass('is-muted'), 'a value with zero points stays in the selector, muted');
    const dots = () => panel.all().filter((e) => e.classes.has('emerald-rg-pt'));
    ok(dots().length === 12, '12 dots for 12 receipts (How hard)');
    const svg = panel.all().find((e) => e.classes.has('emerald-rg-svg'));
    ok(svg && svg.getAttribute('aria-label') === '12 receipts, How hard, range 1 to 10', 'svg text alternative: ' + (svg && svg.getAttribute('aria-label')));
    ok(dots().filter((d) => d.getAttribute('tabindex') === '0').length === 1, 'roving tabindex: exactly one dot is a tab stop');
    const dotCircle = (d) => d.children[1];
    const zones = dots().map((d) => dotCircle(d).cls.match(/is-(\w+)/)[1]);
    ok(zones.every((z) => ['good', 'caution', 'risk'].includes(z)), 'every How hard dot carries a zone class');
    ok(panel.all().some((e) => e.classes.has('emerald-rg-swatch') && e.hasClass('is-good')), 'legend swatches rendered from the zone function');
    ok(panel.textContent.includes('Good 1-4') && panel.textContent.includes('Caution 5-7') && panel.textContent.includes('Risk 8-10'), 'legend text on screen: Good 1-4, Caution 5-7, Risk 8-10');
    ok(panel.textContent.includes('12 receipts.'), 'count line: 12 receipts.');
    // newest selected by default: the card shows the AI tag + summary
    ok(panel.textContent.includes('Wrote the spec.') && panel.textContent.includes('Written by AI, approved by you, edited by you') && panel.textContent.includes('Writing'), 'card: summary, work type and the AI tag for the newest receipt');
    // click earlier receipt: summary None.
    const svgEl = panel.all().find((e) => e.classes.has('emerald-rg-svg'));
    svgEl.dispatch('click', { clientX: 0 });
    ok(panel.textContent.includes('None.') && !panel.textContent.includes('Wrote the spec.'), 'clicking the leftmost dot selects the oldest receipt; empty summary reads None.');
    // keyboard: ArrowRight on the selected dot moves to the next
    const sel1 = dots().find((d) => d.hasClass('is-sel'));
    ok(sel1 && sel1.getAttribute('data-rid') === 'r0', 'selected dot is r0');
    sel1.dispatch('keydown', { key: 'ArrowRight' });
    ok(dots().find((d) => d.hasClass('is-sel')).getAttribute('data-rid') === 'r1' && FakeEl.doc.activeElement && FakeEl.doc.activeElement.getAttribute('data-rid') === 'r1', 'ArrowRight selects the next receipt and moves focus to its dot');
    dots().find((d) => d.hasClass('is-sel')).dispatch('keydown', { key: 'Enter' });
    ok(dots().find((d) => d.hasClass('is-sel')).getAttribute('data-rid') === 'r1', 'Enter keeps the selection');
    // Earlier / Later
    byText(panel, 'Later', 'button')[0].dispatch('click');
    ok(dots().find((d) => d.hasClass('is-sel')).getAttribute('data-rid') === 'r2', 'Later steps to the next receipt');
    byText(panel, 'Earlier', 'button')[0].dispatch('click'); byText(panel, 'Earlier', 'button')[0].dispatch('click');
    ok(dots().find((d) => d.hasClass('is-sel')).getAttribute('data-rid') === 'r0' && byText(panel, 'Earlier', 'button')[0].disabled === true, 'Earlier steps back and disables at the oldest');
    // hover
    svgEl.dispatch('pointermove', { clientX: 300 });
    ok(panel.all().find((e) => e.classes.has('emerald-rg-hover')).text.includes('How hard'), 'hover text names the value');
    // metric change: flow with words
    chips.find((c) => c.text === 'Flow state').dispatch('click');
    ok(panel.textContent.includes('NoSomewhatYes') || (panel.textContent.includes('No') && panel.textContent.includes('Somewhat') && panel.textContent.includes('Yes')), 'Flow state legend shows only the receipt words');
    ok(!panel.textContent.includes('Good 0'), 'no numeric zone text on the word scale');
    ok(panel.all().filter((e) => e.classes.has('emerald-rg-pt')).length === 12, 'flow 0 is a real value (a dot), 12 dots');
    // AI verification: zero points -> empty line state, still selectable
    panel.all().find((e) => e.classes.has('emerald-rg-chip') && e.text === 'AI verification').dispatch('click');
    ok(panel.textContent.includes('No receipts have a "AI verification" rating yet.'), 'zero-point value shows its own empty line state');
    // Esc closes via onClose; destroy removes the listener
    const before = events.docListeners.length;
    events.docListeners.forEach((f) => f({ key: 'Escape', defaultPrevented: false }));
    ok(before >= 1, 'Esc listener registered on the document');
    h.destroy();
    ok(events.docRemoved >= 1 && host.children.length === 0, 'destroy removes the document listener and the panel');
  }
  {
    // narrow pane + Show all
    const all = Array.from({ length: 130 }, (_, i) => rcpt(i));
    const api = fakeApi(all);
    const { panel, h } = mount(api, { width: 500 });
    await settle();
    ok(api.log[0].limit === 20, 'narrow pane (500px) asks for the newest 20');
    ok(panel.textContent.includes('Showing the newest 20 of 130 receipts.'), 'count line offers Show all: ' + panel.all().filter((e) => e.classes.has('emerald-rg-count'))[0].textContent);
    byText(panel, 'Show all', 'button')[0].dispatch('click');
    await settle();
    ok(panel.all().filter((e) => e.classes.has('emerald-rg-pt')).length === 130, 'Show all loads all 130 (two pages)');
    // range chip
    panel.all().find((e) => e.classes.has('emerald-rg-chip') && e.text === '7 days').dispatch('click');
    await settle();
    const last = api.log[api.log.length - 1];
    ok(!!last.from && last.offset === 0, 'range chip re-queries with from and resets paging');
    h.destroy();
  }
  {
    // empty states
    const { panel, h } = mount(fakeApi([]));
    await settle();
    ok(panel.textContent.includes('No receipts yet. Finish a session and rate it, or ask Qarett to file one.'), 'empty project: the spec empty state');
    ok(panel.all().some((e) => e.classes.has('emerald-rg-close')), 'close button present on the empty state (never a dead panel)');
    h.destroy();
  }
  {
    // error + retry
    let calls = 0;
    const api = { async getProjectReceipts() { calls++; return calls === 1 ? { data: null, error: 'Server error. Try again later.', status: 500 } : { data: { data: [rcpt(1)], total: 1 }, error: null, status: 200 }; } };
    const { panel, h } = mount(api);
    await settle();
    ok(panel.all().some((e) => e.getAttribute('role') === 'alert') && panel.textContent.includes('Server error. Try again later.'), 'error state: role=alert with the message');
    byText(panel, 'Try again', 'button')[0].dispatch('click');
    await settle();
    ok(panel.all().filter((e) => e.classes.has('emerald-rg-pt')).length === 1, 'Try again reloads and draws');
    h.destroy();
  }
  {
    // stale-response guard: first request resolves AFTER the second
    const resolvers = [];
    const mk = (n) => ({ data: { data: Array.from({ length: n }, (_, i) => rcpt(i)).reverse(), total: n }, error: null, status: 200 });
    const api = { getProjectReceipts: () => new Promise((res) => resolvers.push(res)) };
    const { panel, h } = mount(api);
    await settle();
    // trigger a second load while the first is pending (range chip is not visible in the loading state, so use the same path as Show all)
    resolvers[0](mk(3)); await settle();
    panel.all().find((e) => e.classes.has('emerald-rg-chip') && e.text === '7 days').dispatch('click');
    panel.all().find((e) => e.classes.has('emerald-rg-chip') && e.text === '30 days').dispatch('click');
    await settle();
    ok(resolvers.length === 3, 'two range clicks started two requests');
    resolvers[2](mk(5)); await settle();
    resolvers[1](mk(2)); await settle();
    ok(panel.all().filter((e) => e.classes.has('emerald-rg-pt')).length === 5, 'a late response from the older request is ignored (5 dots, not 2)');
    h.destroy();
  }

  // 4. Client: envelope kept (total survives), params, no cache
  {
    const bundlePath = bundle('src/api/client.ts', 'client.cjs');
    const { EmraldAPIClient } = require(bundlePath);
    const seen = [];
    global.__requestUrl = async (p) => { seen.push(p.url); return { status: 200, json: { data: [rcpt(1)], total: 77, limit: 100, offset: 0 } }; };
    const c = new EmraldAPIClient('KEY', 'https://api.test/v1');
    const res = await c.getProjectReceipts('ITEM 1', { from: '2026-10-01T00:00:00.000Z', limit: 500, offset: 100 });
    const u = new URL(seen[0]);
    ok(u.pathname === '/v1/receipts' && u.searchParams.get('item_id') === 'ITEM 1' && u.searchParams.get('limit') === '100' && u.searchParams.get('offset') === '100' && u.searchParams.get('from') === '2026-10-01T00:00:00.000Z', 'client URL: item_id, limit capped at 100, offset, from: ' + seen[0]);
    ok(res.data && res.data.total === 77 && Array.isArray(res.data.data), 'client keeps the envelope so total survives');
    const c2 = await c.getReceipts({ limit: 5 });
    ok(Array.isArray(c2.data), 'the existing getReceipts still unwraps to an array (unchanged)');
  }

  // 5. E-level overview wiring
  {
    const { ELevelOverviewView } = require(bundle('src/views/workspace/elevel-overview.ts', 'overview.cjs'));
    const api = fakeApi(Array.from({ length: 4 }, (_, i) => rcpt(i)));
    const plugin = { apiClient: api, app: {} };
    const v = new ELevelOverviewView({}, plugin);
    v.items = [
      { id: 'A', name: 'Alpha', status: 'active', effort_level: 'E2' },
      { id: 'B', name: 'Beta', status: 'paused', effort_level: 'E1' },
      { id: 'C', name: 'Gamma', status: 'active', effort_level: 'E3' }
    ];
    v.availableHours = 4; v.projectContainer = new FakeEl('div');
    v.renderProjectTable();
    const table = () => v.projectContainer.all().find((e) => e.tag === 'table');
    const tbody = () => table().children.find((c) => c.tag === 'tbody');
    const btns = () => v.projectContainer.all().filter((e) => e.classes.has('emerald-wv-receipts-btn'));
    ok(btns().length === 3, 'every project row (paused included) has a receipt graph button');
    ok(btns().every((b) => /^Receipt graph for /.test(b.getAttribute('aria-label')) && b.getAttribute('aria-expanded') === 'false'), 'button aria-label and aria-expanded set');
    ok(v.projectContainer.all().filter((e) => e.classes.has('emerald-wv-compare-btn') && e.tag === 'span').length === 3, 'the existing compare buttons are still there');
    btns()[0].dispatch('click');
    await settle();
    const rowsNow = () => tbody().children.map((r) => (r.classes.has('emerald-rg-row') ? 'GRAPH' : 'row'));
    ok(rowsNow().join() === 'row,GRAPH,row,row', 'the panel opens as a row directly below its project: ' + rowsNow().join());
    const panelRow = tbody().children[1];
    ok(panelRow.children[0].getAttribute('colspan') === '7', 'panel cell spans the full table width');
    ok(btns()[0].getAttribute('aria-expanded') === 'true', 'button reports expanded');
    btns()[1].dispatch('click');
    await settle();
    ok(rowsNow().join() === 'row,row,GRAPH,row' && v.projectContainer.all().filter((e) => e.classes.has('emerald-rg-panel')).length === 1, 'opening another project closes the first (one at a time): ' + rowsNow().join());
    btns()[1].dispatch('click');
    ok(rowsNow().join() === 'row,row,row', 'the same button closes it');
    btns()[2].dispatch('click');
    await settle();
    // X and Esc
    const closeBtn = v.projectContainer.all().find((e) => e.classes.has('emerald-rg-close'));
    closeBtn.dispatch('click');
    ok(rowsNow().join() === 'row,row,row' && FakeEl.doc.activeElement === btns()[2], 'X closes the panel and returns focus to its button');
    btns()[0].dispatch('click'); await settle();
    events.docListeners.forEach((f) => f({ key: 'Escape', defaultPrevented: false }));
    ok(rowsNow().join() === 'row,row,row', 'Esc closes the open panel');
    btns()[0].dispatch('click'); await settle();
    v.activeFilter = 'E3'; v.renderProjectTable();
    ok(v.openGraph === null && events.docListeners.length === 0, 'a table rebuild (filter change) closes the panel and drops its listener');
    btns()[0].dispatch('click'); await settle();
    await v.onClose();
    ok(v.openGraph === null && events.docListeners.length === 0, 'closing the view destroys the panel and its listener');
  }

  // 6. Bundled siblings: D5/D6 Toggl "left out" note (C1c) and the export tooltip copy
  {
    const pn = require(bundle('src/views/workspace/provider-note.ts', 'provider-note.cjs'));
    const { providerNoteState, providerLeftOut, renderProviderNote, PROVIDER_TOOLTIP } = pn;
    ok(providerNoteState('D5', { reason: 'provider_projects_excluded' }) === 'empty' && providerNoteState('D6', { reason: 'provider_projects_excluded', excluded_provider_items: 2 }) === 'empty', 'D5/D6 reason => empty state');
    ok(providerNoteState('D5', { excluded_provider_items: 3 }) === 'partial' && providerNoteState('D6', { excluded_provider_items: '1' }) === 'partial', 'excluded items > 0 => footnote (string numbers too)');
    ok(providerNoteState('D5', {}) === null && providerNoteState('D5', null) === null && providerNoteState('D5', { excluded_provider_items: 0 }) === null, 'no Toggl fields => no note');
    ok(providerNoteState('D1', { reason: 'provider_projects_excluded', excluded_provider_items: 4 }) === null, 'other metrics never show the note');
    ok(providerLeftOut({ excluded_provider_items: 1 }) === '1 Toggl project left out' && providerLeftOut({ excluded_provider_items: 3 }) === '3 Toggl projects left out', 'plural rule');
    const host = new FakeEl('div');
    renderProviderNote(host, 'D5', { reason: 'provider_projects_excluded' });
    const strong = host.all().find((e) => e.tag === 'strong');
    const rest = strong.parent.text;
    ok(strong.text + rest === 'No data yet. This metric covers projects you manage in EMRALD. Your Toggl projects are left out of it, and they still count in your other metrics. Add a project in EMRALD to see this one.', 'state A copy is the approved text verbatim (bold lead + rest)');
    const host2 = new FakeEl('div');
    renderProviderNote(host2, 'D6', { excluded_provider_items: 2 });
    ok(host2.textContent === 'Based on your EMRALD projects. 2 Toggl projects left out.', 'state B copy is the approved text verbatim');
    ok(renderProviderNote(new FakeEl('div'), 'D8', { excluded_provider_items: 2 }) === false, 'no note for D8');
    const webTip = webPath ? path.join(path.dirname(webPath), 'exportTip.ts') : '';
    const { EXPORT_TIP } = require(bundle('src/utils/export-tip.ts', 'export-tip.cjs'));
    if (webTip && fs.existsSync(webTip)) {
      const js = esbuild.transformSync(fs.readFileSync(webTip, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
      const m = { exports: {} }; new Function('module', 'exports', js)(m, m.exports);
      ok(m.exports.EXPORT_TIP === EXPORT_TIP, 'export tooltip is byte-identical to the web twin (cmo-gated copy)');
    }
    ok(!/\u2014|\u2013/.test(EXPORT_TIP + PROVIDER_TOOLTIP), 'no em or en dashes in the new tooltip strings');
  }

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
