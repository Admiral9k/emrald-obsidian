// Export "i" tooltip copy. ONE string so every surface says the same thing (web app and plugin).
// Verbatim from Emrald-freed-main src/lib/exportTip.ts: gated by cmo 10/7 (Q7 PASS), approved by
// Devon 10/7. Facts verified in prod 10/7: the retain-metric-history cron prunes raw intra-day
// snapshots after 120 days; the daily summary table is permanent; sessions, receipts and check-ins
// are never pruned; Pro export includes metric_history_daily; free export = last 90 days + current values.
// Do not edit without a cmo re-gate. Zero em-dashes.
export const EXPORT_TIP =
	'Saves your EMRALD data as a portable JSON file. Receipts, sessions and check-ins are never deleted. PRO exports include your full daily metric history, kept indefinitely (intra-day snapshots are consolidated into daily values after 120 days). Free exports cover the last 90 days and current metric values.';
