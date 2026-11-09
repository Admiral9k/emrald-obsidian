// EMRALD per-project receipt graph: the inline panel under a project row in the E-level overview.
// Port of the web app's ReceiptGraph.svelte (spec: emrald-mcp docs/RECEIPT-GRAPH-SPEC.md v1.1).
// Pick one receipt value, see every receipt for the project as a line of dots (oldest left, evenly
// spaced), click a dot to see that session: date, length, ratings, work type and the approved
// one-line summary. Free for everyone. Hand-rolled SVG (createSvg), no chart dependency.
// All logic that does not touch the DOM lives in receipt-graph-model.ts.

import { setIcon } from 'obsidian';
import type { ProjectReceipt } from '../../api/client';
import {
	EMPTY_ALL,
	METRICS,
	RANGES,
	ZONE_NAME,
	chartLabel,
	countsFor,
	dotLabel,
	formatDuration,
	loadProjectReceipts,
	longDate,
	pointsFor,
	shortDate,
	valueText,
	wantedCount,
	zoneOf,
	zoneSpans
} from './receipt-graph-model';
import type { Metric, MetricKey, RangeKey, ReceiptSource, Zone } from './receipt-graph-model';

export interface ReceiptGraphHandle {
	destroy(): void;
}

export interface ReceiptGraphOptions {
	api: ReceiptSource;
	itemId: string;
	itemName: string;
	onClose: () => void;
}

// Chart geometry (fluid: the chart is exactly the width of its card, so nothing scrolls).
const HEIGHT = 240;
const PAD_T = 16;
const PAD_B = 40;
const PAD_R = 12;
const DOT_INSET = 14; // first and last dot sit this far inside the grid lines
const INNER_H = HEIGHT - PAD_T - PAD_B;

export function mountReceiptGraph(host: HTMLElement, opts: ReceiptGraphOptions): ReceiptGraphHandle {
	const { api, itemId, itemName, onClose } = opts;
	const doc = host.ownerDocument;

	let destroyed = false;
	let loading = true;
	let error = '';
	let rows: ProjectReceipt[] = []; // oldest -> newest
	let total = 0;
	let range: RangeKey = 'all';
	let showAll = false;
	let metricKey: MetricKey = 'perceived_effort';
	let selectedId: string | null = null;
	let loadSeq = 0;
	let chartW = 0;

	const metric = (): Metric => METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
	const points = (): ProjectReceipt[] => pointsFor(rows, metricKey);
	const selected = (): ProjectReceipt | null => rows.find((r) => r.id === selectedId) ?? null;

	// ── Frame ──
	const panel = host.createDiv({ cls: 'emerald-rg-panel', attr: { role: 'region', 'aria-label': `Receipt graph for ${itemName}` } });
	const head = panel.createDiv({ cls: 'emerald-rg-head' });
	const title = head.createDiv({ cls: 'emerald-rg-title' });
	title.createSpan({ cls: 'emerald-rg-kicker', text: 'Receipt graph' });
	title.createSpan({ cls: 'emerald-rg-name', text: itemName });
	const closeBtn = head.createEl('button', { cls: 'emerald-rg-close', attr: { type: 'button', 'aria-label': `Close receipt graph for ${itemName}` } });
	setIcon(closeBtn, 'x');
	closeBtn.addEventListener('click', () => onClose());
	const body = panel.createDiv({ cls: 'emerald-rg-body' });

	// Refs rebuilt by renderBody / drawChart.
	let chartBox: HTMLElement | null = null;
	let svgHost: HTMLElement | null = null;
	let cardHost: HTMLElement | null = null;
	let hoverText: HTMLElement | null = null;
	let guideEl: SVGLineElement | null = null;
	const dotEls = new Map<string, SVGGElement>();

	// Esc closes the panel while it is open.
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && !e.defaultPrevented) onClose();
	};
	doc.addEventListener('keydown', onKey);

	// ── Focus bookkeeping: a full re-render must not drop keyboard focus ──
	function focusKey(): string | null {
		const a = doc.activeElement as HTMLElement | null;
		return a && panel.contains(a) ? (a.getAttribute('data-focus-key') ?? null) : null;
	}
	function restoreFocus(key: string | null) {
		if (!key) return;
		const el = Array.from(panel.querySelectorAll<HTMLElement>('[data-focus-key]')).find((n) => n.getAttribute('data-focus-key') === key);
		el?.focus({ preventScroll: true });
	}

	// ── Data ──
	async function load() {
		const seq = ++loadSeq;
		const firstLoad = rows.length === 0;
		loading = true;
		error = '';
		if (!firstLoad) chartBox?.addClass('is-loading');
		try {
			const res = await loadProjectReceipts(api, itemId, range, wantedCount(showAll, panel.clientWidth));
			if (destroyed || seq !== loadSeq) return; // closed, or a newer request superseded this one
			rows = res.rows;
			total = res.total;
			if (!rows.some((r) => r.id === selectedId)) selectedId = rows.length ? rows[rows.length - 1].id : null;
			loading = false;
		} catch (err) {
			if (destroyed || seq !== loadSeq) return;
			error = err instanceof Error ? err.message : 'Could not load receipts';
			loading = false;
		}
		const key = focusKey();
		renderBody();
		restoreFocus(key);
	}

	function pickRange(r: RangeKey) {
		if (range === r) return;
		range = r;
		showAll = false;
		void load();
	}
	function pickAll() {
		showAll = true;
		void load();
	}

	// ── Body ──
	function renderBody() {
		if (destroyed) return;
		body.empty();
		chartBox = null;
		svgHost = null;
		cardHost = null;
		hoverText = null;
		guideEl = null;
		dotEls.clear();

		if (loading && rows.length === 0) {
			body.createDiv({ cls: 'emerald-rg-state', text: 'Loading receipts' });
			return;
		}
		if (error) {
			const err = body.createDiv({ cls: 'emerald-rg-state emerald-rg-error', attr: { role: 'alert' } });
			err.createEl('p', { text: error });
			const retry = err.createEl('button', { cls: 'emerald-rg-chip', text: 'Try again', attr: { type: 'button' } });
			retry.addEventListener('click', () => void load());
			return;
		}

		renderControls();

		if (rows.length === 0) {
			body.createEl('p', {
				cls: 'emerald-rg-empty',
				text: range === 'all' ? EMPTY_ALL : `No receipts in the last ${range} days.`
			});
			return;
		}

		chartBox = body.createDiv({ cls: 'emerald-rg-chart' });
		svgHost = chartBox.createDiv({ cls: 'emerald-rg-svghost' });
		renderFoot(chartBox);
		cardHost = body.createDiv({ cls: 'emerald-rg-card', attr: { 'aria-live': 'polite', 'aria-label': 'Selected receipt' } });
		chartW = measure();
		drawChart();
		drawCard();
		if (ro) {
			ro.disconnect();
			ro.observe(chartBox);
		}
	}

	function renderControls() {
		const controls = body.createDiv({ cls: 'emerald-rg-controls' });
		const counts = countsFor(rows);

		const mGroup = controls.createDiv({ cls: 'emerald-rg-group', attr: { role: 'radiogroup', 'aria-label': 'Receipt value' } });
		for (const m of METRICS) {
			const chip = mGroup.createEl('button', {
				cls: 'emerald-rg-chip',
				text: m.label,
				attr: { type: 'button', role: 'radio', 'aria-checked': String(metricKey === m.key), title: m.question, 'data-focus-key': `m:${m.key}` }
			});
			if (metricKey === m.key) chip.addClass('is-active');
			if (counts[m.key] === 0) chip.addClass('is-muted');
			chip.addEventListener('click', () => {
				metricKey = m.key;
				const key = focusKey();
				renderBody();
				restoreFocus(key);
			});
		}

		const rGroup = controls.createDiv({ cls: 'emerald-rg-group', attr: { role: 'radiogroup', 'aria-label': 'Time range' } });
		for (const r of RANGES) {
			const chip = rGroup.createEl('button', {
				cls: 'emerald-rg-chip',
				text: r.label,
				attr: { type: 'button', role: 'radio', 'aria-checked': String(range === r.key), 'data-focus-key': `r:${r.key}` }
			});
			if (range === r.key) chip.addClass('is-active');
			chip.addEventListener('click', () => pickRange(r.key));
		}
	}

	function renderFoot(box: HTMLElement) {
		const m = metric();
		const foot = box.createDiv({ cls: 'emerald-rg-foot' });
		const legendRow = foot.createDiv({ cls: 'emerald-rg-legendrow' });
		const spans = zoneSpans(m);
		if (spans.length) {
			const legend = legendRow.createSpan({ cls: 'emerald-rg-legend', attr: { 'aria-label': 'Dot colors' } });
			for (const sp of spans) {
				const key = legend.createSpan({ cls: 'emerald-rg-key' });
				key.createEl('i', { cls: `emerald-rg-swatch is-${sp.zone}` });
				key.appendText(`${sp.named ? ZONE_NAME[sp.zone] + ' ' : ''}${sp.text}`);
			}
		}
		hoverText = legendRow.createSpan({ cls: 'emerald-rg-hover', attr: { 'aria-hidden': 'true' } });

		const count = foot.createSpan({ cls: 'emerald-rg-count' });
		if (total > rows.length) {
			count.appendText(`Showing the newest ${rows.length} of ${total} receipts. `);
			const link = count.createEl('button', { cls: 'emerald-rg-link', text: 'Show all', attr: { type: 'button', 'data-focus-key': 'show-all' } });
			link.addEventListener('click', pickAll);
		} else {
			count.appendText(`${rows.length} receipt${rows.length === 1 ? '' : 's'}${range === 'all' ? '' : ` in the last ${range} days`}.`);
		}
	}

	// ── Chart ──
	function measure(): number {
		const w = (chartBox?.clientWidth ?? 0) - 16;
		return w > 0 ? w : 600;
	}

	function drawChart() {
		if (!svgHost) return;
		svgHost.empty();
		guideEl = null;
		dotEls.clear();
		const m = metric();
		const pts = points();
		if (pts.length === 0) {
			svgHost.createEl('p', { cls: 'emerald-rg-empty', text: `No receipts have a "${m.label}" rating yet.` });
			return;
		}

		const W = Math.max(chartW, 280);
		const labelW = m.axis ? 32 : 18; // y-axis label column (fixed so the plot never shifts between values)
		const gridL = labelW + 10;
		const plotL = gridL + DOT_INSET;
		const plotR = W - PAD_R - DOT_INSET;
		const xAt = (i: number) => (pts.length <= 1 ? (plotL + plotR) / 2 : plotL + (i * (plotR - plotL)) / (pts.length - 1));
		const yAt = (v: number) => PAD_T + ((m.max - v) / (m.max - m.min)) * INNER_H;
		const spacing = pts.length > 1 ? (plotR - plotL) / (pts.length - 1) : 40;
		const dotR = Math.max(2.2, Math.min(5.5, spacing * 0.38));
		const labelEvery = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((plotR - plotL) / 70))));
		const showX = (i: number) => i === pts.length - 1 || (i % labelEvery === 0 && (pts.length - 1 - i) * spacing >= 56);
		const tabStop = pts.find((p) => p.id === selectedId)?.id ?? pts[pts.length - 1].id;

		const svg = svgHost.createSvg('svg', {
			cls: 'emerald-rg-svg',
			attr: { viewBox: `0 0 ${W} ${HEIGHT}`, width: W, height: HEIGHT, role: 'img', 'aria-label': chartLabel(m, pts) }
		});

		for (let t = m.min; t <= m.max; t++) {
			svg.createSvg('line', { cls: 'emerald-rg-grid', attr: { x1: gridL, x2: W - PAD_R, y1: yAt(t), y2: yAt(t) } });
			svg.createSvg('text', { cls: 'emerald-rg-ylab', attr: { x: labelW, y: yAt(t) + 4, 'text-anchor': 'end' } })
				.setText(m.axis ? m.axis[t - m.min] : String(t));
		}
		guideEl = svg.createSvg('line', { cls: 'emerald-rg-guide', attr: { y1: PAD_T, y2: HEIGHT - PAD_B, x1: 0, x2: 0 } });
		guideEl.addClass('emrald-hidden');

		const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(p[m.key] as number).toFixed(1)}`).join(' ');
		svg.createSvg('path', { cls: `emerald-rg-line${m.dir === null ? ' is-neutral' : ''}`, attr: { d: path } });

		pts.forEach((p, i) => {
			const v = p[m.key] as number;
			if (showX(i)) {
				svg.createSvg('text', { cls: 'emerald-rg-xlab', attr: { x: xAt(i), y: HEIGHT - 16, 'text-anchor': 'middle' } }).setText(shortDate(p));
			}
			const z: Zone | null = zoneOf(m, v);
			const g = svg.createSvg('g', {
				cls: 'emerald-rg-pt',
				attr: {
					role: 'button',
					tabindex: p.id === tabStop ? 0 : -1,
					'data-rid': p.id,
					'data-focus-key': `d:${p.id}`,
					'aria-label': dotLabel(m, p),
					'aria-pressed': String(p.id === selectedId)
				}
			});
			if (p.id === selectedId) g.addClass('is-sel');
			g.createSvg('circle', { cls: 'emerald-rg-ring', attr: { cx: xAt(i), cy: yAt(v), r: dotR + 4 } });
			g.createSvg('circle', { cls: `emerald-rg-dot ${z ? 'is-' + z : 'is-neutral'}`, attr: { cx: xAt(i), cy: yAt(v), r: dotR } });
			g.addEventListener('keydown', (e: KeyboardEvent) => onPointKey(e, i, pts));
			dotEls.set(p.id, g);
		});

		// The SVG handles the pointer (nearest dot), so a crowded chart is still easy to hit.
		const nearest = (clientX: number): number => {
			const box = svg.getBoundingClientRect();
			if (!box.width) return -1;
			const x = ((clientX - box.left) / box.width) * W;
			let best = 0;
			let bestD = Infinity;
			for (let i = 0; i < pts.length; i++) {
				const d = Math.abs(xAt(i) - x);
				if (d < bestD) {
					bestD = d;
					best = i;
				}
			}
			return best;
		};
		svg.addEventListener('pointermove', (e: PointerEvent) => {
			const i = nearest(e.clientX);
			setHover(i >= 0 ? pts[i].id : null, i >= 0 ? xAt(i) : 0);
		});
		svg.addEventListener('pointerleave', () => setHover(null, 0));
		svg.addEventListener('click', (e: MouseEvent) => {
			const i = nearest(e.clientX);
			if (i >= 0) select(pts[i].id, false);
		});
	}

	function setHover(id: string | null, x: number) {
		for (const [rid, g] of dotEls) g.toggleClass('is-hov', rid === id && rid !== selectedId);
		if (guideEl) {
			if (id) {
				guideEl.setAttribute('x1', String(x));
				guideEl.setAttribute('x2', String(x));
				guideEl.removeClass('emrald-hidden');
			} else {
				guideEl.addClass('emrald-hidden');
			}
		}
		const p = id ? points().find((r) => r.id === id) : null;
		const m = metric();
		hoverText?.setText(p ? `${shortDate(p)}: ${m.label} ${valueText(m, p[m.key] as number)}` : '');
	}

	function select(id: string, refocus: boolean) {
		selectedId = id;
		drawChart();
		drawCard();
		if (refocus) dotEls.get(id)?.focus({ preventScroll: true });
	}

	function onPointKey(e: KeyboardEvent, i: number, pts: ProjectReceipt[]) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			e.preventDefault();
			const j = Math.min(pts.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
			select(pts[j].id, true);
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select(pts[i].id, true);
		}
	}

	// Earlier / Later step through the dots on the chart (precise on a phone, where dots sit close together).
	function step(dir: -1 | 1) {
		const pts = points();
		if (pts.length === 0) return;
		const cur = pts.findIndex((p) => p.id === selectedId);
		const j = cur < 0 ? pts.length - 1 : Math.min(pts.length - 1, Math.max(0, cur + dir));
		const key = focusKey();
		select(pts[j].id, false);
		restoreFocus(key);
	}

	// ── Receipt card (sits UNDER the chart) ──
	function drawCard() {
		if (!cardHost) return;
		cardHost.empty();
		const sel = selected();
		if (!sel) {
			cardHost.createEl('p', { cls: 'emerald-rg-empty', text: 'Click a dot to see that session.' });
			return;
		}
		const pts = points();
		const selIdx = pts.findIndex((p) => p.id === selectedId);

		const header = cardHost.createDiv({ cls: 'emerald-rg-card-head' });
		const when = header.createDiv();
		when.createEl('p', { cls: 'emerald-rg-card-date', text: longDate(sel) });
		const dur = sel.session?.duration_minutes;
		if (dur != null) when.createEl('p', { cls: 'emerald-rg-card-sub', text: `${formatDuration(dur)} session` });

		const stepRow = header.createDiv({ cls: 'emerald-rg-step' });
		const earlier = stepRow.createEl('button', { cls: 'emerald-rg-chip', text: 'Earlier', attr: { type: 'button', 'aria-label': 'Earlier receipt', 'data-focus-key': 's:-1' } });
		const later = stepRow.createEl('button', { cls: 'emerald-rg-chip', text: 'Later', attr: { type: 'button', 'aria-label': 'Later receipt', 'data-focus-key': 's:1' } });
		earlier.disabled = pts.length === 0 || selIdx <= 0;
		later.disabled = pts.length === 0 || selIdx === pts.length - 1;
		earlier.addEventListener('click', () => step(-1));
		later.addEventListener('click', () => step(1));

		const bodyEl = cardHost.createDiv({ cls: 'emerald-rg-card-body' });
		const vals = bodyEl.createEl('dl', { cls: 'emerald-rg-vals' });
		for (const m of METRICS) {
			const v = sel[m.key];
			if (v == null) continue;
			const row = vals.createDiv({ cls: 'emerald-rg-val' });
			if (m.key === metricKey) row.addClass('is-on');
			row.createEl('dt', { text: m.label });
			row.createEl('dd', { text: valueText(m, v) });
		}
		const fields = bodyEl.createDiv({ cls: 'emerald-rg-fields' });
		if (sel.work_type) {
			const wt = fields.createEl('p', { cls: 'emerald-rg-field' });
			wt.createSpan({ cls: 'emerald-rg-field-label', text: 'Work type' });
			wt.appendText(sel.work_type);
		}
		const sm = fields.createEl('p', { cls: 'emerald-rg-field' });
		sm.createSpan({ cls: 'emerald-rg-field-label', text: 'Summary' });
		sm.appendText(sel.ai_summary ? sel.ai_summary : 'None.');
		if (sel.ai_summary && sel.ai_authored) {
			fields.createEl('p', { cls: 'emerald-rg-tag', text: `Written by AI, approved by you${sel.ai_edited_by_user ? ', edited by you' : ''}` });
		}
	}

	// The chart condenses to the width of its card: redraw (not reload) when the pane resizes.
	const ro = typeof ResizeObserver !== 'undefined'
		? new ResizeObserver(() => {
			if (destroyed || !chartBox) return;
			const w = measure();
			if (Math.abs(w - chartW) > 2) {
				chartW = w;
				drawChart();
			}
		})
		: null;

	renderBody();
	void load();

	return {
		destroy() {
			if (destroyed) return;
			destroyed = true;
			loadSeq++;
			doc.removeEventListener('keydown', onKey);
			ro?.disconnect();
			panel.remove();
		}
	};
}
