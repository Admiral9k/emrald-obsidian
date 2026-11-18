// Data Center, Verification share: the answers list shows each stored value on its own, and the average shows once.
// Run:  node scripts/test-data-center-d21.cjs   (no arguments; bundles the source itself)
const path = require('path');
const os = require('os');
const Module = require('module');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');

class El {
  constructor(tag, opts) { this.tag = tag; this.children = []; this.classes = new Set(); this.text = ''; if (opts && opts.cls) String(opts.cls).split(/\s+/).filter(Boolean).forEach((c) => this.classes.add(c)); if (opts && opts.text !== undefined) this.text = String(opts.text); }
  createEl(tag, opts) { const e = new El(tag, opts); this.children.push(e); return e; }
  createDiv(o) { return this.createEl('div', o); }
  createSpan(o) { return this.createEl('span', o); }
  all(cls) { const out = []; const walk = (e) => { for (const c of e.children) { if (c.classes.has(cls)) out.push(c); walk(c); } }; walk(this); return out; }
  tags(tag) { const out = []; const walk = (e) => { for (const c of e.children) { if (c.tag === tag) out.push(c); walk(c); } }; walk(this); return out; }
  textDeep() { return this.text + ' ' + this.children.map((c) => c.textDeep()).join(' '); }
}
const stub = new Proxy({}, { get: (_, n) => (n === '__esModule' ? false : class { constructor() {} }) });
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'obsidian' ? stub : orig.call(this, req, ...rest); };
const out = path.join(os.tmpdir(), 'emrald-data-center.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src/views/workspace/data-center.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], outfile: out, logLevel: 'silent' });
const { DataCenterView, D_METRICS } = require(out);

// Obsidian's createSvg, as a recorder: svg.createSvg(tag, {attr, cls}) returns a child that records the same way.
class Sv {
  constructor(tag, o) { this.tag = tag; this.attr = (o && o.attr) || {}; this.cls = (o && o.cls) || ''; this.kids = []; this.textContent = ''; }
  createSvg(tag, o) { const e = new Sv(tag, o); this.kids.push(e); return e; }
  find(tag, cls) { const out = []; const walk = (e) => { for (const c of e.kids) { if (c.tag === tag && (!cls || c.cls === cls)) out.push(c); walk(c); } }; walk(this); return out; }
}
global.createSvg = (tag, o) => new Sv(tag, o);

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

function run(pages, metric, range) {
  const calls = [];
  const self = Object.assign(Object.create(DataCenterView.prototype), { timeRange: range || '14d', plugin: { apiClient: { getReceiptsPage: async (o) => { calls.push(o); return { data: { data: pages[o.offset / 100] || [] }, error: null }; } } }, formatDateShort: (iso) => iso.slice(5, 10) });
  const host = new El('div');
  return DataCenterView.prototype.renderVerificationAnswers.call(self, host, 14, metric).then(() => ({ host, calls }));
}
const rec = (id, v, name, day) => ({ id, created_at: `2026-11-${day}T12:00:00Z`, verification_share: v, item: name ? { name } : null });
(async () => {
  ok(D_METRICS.D21 && D_METRICS.D21.category === 'Qarett', 'D21 sits in the Qarett category');
  ok(Object.values(D_METRICS).every((m) => !/\bD\d{1,2}\b/.test(m.name + m.desc + m.explainer)), 'no metric name, description or explainer carries a D-number');

  const metric = { metadata: { avg_verification_share: 7.63, answered_receipts: 8 } };
  const page = [rec('a', 10, 'One', '06'), rec('b', 10, 'Two', '06'), rec('c', 3, 'Three', '04'), rec('d', null, 'Skip', '05'), rec('e', 7, null, '04')];
  let r = await run([page], metric);
  const rows = r.host.tags('tr').slice(1).map((tr) => tr.children.map((c) => c.text));
  ok(rows.length === 4, 'one row per answered receipt, unanswered receipts left out: ' + rows.length);
  ok(JSON.stringify(rows.map((x) => x[2])) === JSON.stringify(['10/10', '10/10', '3/10', '7/10']), 'each row shows its OWN stored value: ' + rows.map((x) => x[2]).join(', '));
  ok(rows[3][1] === '—', 'a receipt with no project shows a dash');
  const avgLines = r.host.all('emerald-wv-d21-answers-avg');
  ok(avgLines.length === 1 && avgLines[0].text === 'Average over the last 30 days: 7.63 from 8 answers.', 'the average appears once, labelled: ' + (avgLines[0] && avgLines[0].text));
  ok(!rows.some((x) => x.some((c) => /7\.63/.test(c))), 'the average is not repeated on any row');
  ok(r.calls.length === 1 && r.calls[0].offset === 0 && !!r.calls[0].from, 'one page read for a short list, with a from date');

  r = await run([[rec('a', 5, 'One', '06')]], { metadata: { avg_verification_share: 5, answered_receipts: 1 } });
  ok(r.host.all('emerald-wv-d21-answers-avg')[0].text === 'Average over the last 30 days: 5.00 from 1 answer.', 'singular answer wording');

  r = await run([[rec('a', null, 'One', '06')]], metric);
  ok(r.host.tags('table').length === 0 && /No answers in the last 14d\./.test(r.host.textDeep()), 'no answered receipts: plain empty line, no table');

  r = await run([[rec('a', 6, 'One', '06')]], undefined);
  ok(r.host.all('emerald-wv-d21-answers-avg').length === 0, 'no metric yet: no average line');

  const many = Array.from({ length: 100 }, (_, i) => rec('m' + i, (i % 10) + 1, 'P', '06'));
  r = await run([many, many.slice(0, 30)], metric);
  ok(r.calls.length === 2 && r.calls[1].offset === 100, 'a full page triggers the next page read');
  ok(r.host.tags('tr').length - 1 === 20, 'the list is capped at 20 rows');

  // ── chart: one dot per stored answer on its own day, gaps left empty, average as a separate dashed line ──
  const DAY = 86400000, now = Date.now();
  const at = (daysAgo, v, id) => ({ id, created_at: new Date(now - daysAgo * DAY).toISOString(), verification_share: v, item: { name: 'P' } });
  const answers = [at(1, 10, 'a'), at(1.2, 10, 'b'), at(3, 3, 'c'), at(9, 7, 'd')];
  const chartSelf = Object.assign(Object.create(DataCenterView.prototype), { formatDateShort: (iso) => iso.slice(5, 10) });
  const svg = chartSelf.buildAnswerChart(answers, 14, 7.63);
  const dots = svg.find('circle');
  ok(dots.length === 3, 'two same-day, same-value answers become ONE dot (4 answers, 3 dots): ' + dots.length);
  ok(svg.find('polyline').length === 0 && svg.find('polygon').length === 0, 'no connecting line and no fill, so empty days stay empty');
  const cy = (d) => Number(d.attr.cy), cx = (d) => Number(d.attr.cx);
  ok(cy(dots[0]) < cy(dots[1]), 'a 10 sits above a 3 (own value, 0 to 10 scale)');
  ok(cx(dots[2]) < cx(dots[1]) && cx(dots[1]) < cx(dots[0]), 'older answers sit further left (placed on their own date)');
  const gap = (cx(dots[1]) - cx(dots[2])), oneDay = (cx(dots[0]) - cx(dots[1]));
  ok(Math.abs(gap / oneDay - 3) < 0.2, 'x is proportional to real time: a 6-day gap is about 3 times a 2-day gap (' + (gap / oneDay).toFixed(2) + ')');
  const counts = svg.find('text', 'emerald-wv-chart-count');
  ok(counts.length === 1 && counts[0].textContent === '\u00d72', 'the shared dot carries a count: ' + (counts[0] && counts[0].textContent));
  ok(dots[0].kids[0].textContent.includes('2 answers: 10/10') && dots[1].kids[0].textContent.endsWith(': 3/10'), 'hover says "2 answers: 10/10" for the shared dot and the single value for the others');
  const labels = svg.find('text', 'emerald-wv-chart-range-label').map((t) => t.textContent);
  ok(labels.join(',') === '10,0', 'axis labels are whole numbers: ' + labels.join(','));
  const zero = svg.find('text', 'emerald-wv-chart-range-label')[1], bottomGrid = svg.find('line', 'emerald-wv-chart-grid').pop();
  ok(Math.abs(Number(zero.attr.y) - 4 - Number(bottomGrid.attr.y1)) < 0.01, '"0" sits level with the bottom gridline');
  const dateRows = svg.find('text', 'emerald-wv-chart-trend-note');
  ok(dateRows.length === 2 && dateRows.every((t) => Number(t.attr.y) > Number(bottomGrid.attr.y1) + 4), 'the date row sits below the plot, under the "0"');
  const wide = chartSelf.buildAnswerChart(answers, 14, 7.63, 800);
  ok(wide.attr.viewBox.startsWith('0 0 800 ') && Math.max(...wide.find('circle').map((d) => Number(d.attr.cx))) > 700, 'drawn at the panel width (800), dots use the whole width');
  const dashed = svg.find('line', 'emerald-wv-chart-trend');
  ok(dashed.length === 1 && Math.abs(Number(dashed[0].attr.y1) - 175 + 4 + (7.63 / 10) * (175 - 8)) < 0.2 && dashed[0].attr.y1 === dashed[0].attr.y2, 'the average is ONE flat dashed line at 7.63, separate from the series');
  const avgLabel = svg.find('text', 'emerald-wv-chart-avg-label');
  ok(avgLabel.length === 1 && avgLabel[0].textContent === '30-day average 7.63', 'the value is written on the dashed line: ' + (avgLabel[0] && avgLabel[0].textContent));
  ok(Number(avgLabel[0].attr.y) < Number(dashed[0].attr.y1), 'the label sits just above the line');
  ok(!svg.find('text', 'emerald-wv-chart-trend-note').some((t) => /Dashed line/.test(t.textContent)), 'the old note in the date row is gone');
  ok(dots.every((d) => d.kids.some((k) => k.tag === 'title' && /\/10$/.test(k.textContent))), 'each dot carries its date and value as a hover label');
  ok(chartSelf.buildAnswerChart(answers, 14, null).find('line', 'emerald-wv-chart-trend').length === 0, 'no average yet: no dashed line');

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' check(s) FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
