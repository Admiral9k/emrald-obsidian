/**
 * Overtime auto-pause schedule (shared shape with the web app's src/lib/overtimeAutoPause.ts).
 *
 * The session auto-pauses once elapsed WORK time (pause time excluded) passes the prescribed
 * time plus 2 hours. A manual resume used to re-arm the guard while elapsed was still past that
 * line, so the next tick paused the session again and the user could not resume (S14 bug,
 * root cause found by reading the web SessionBar resume path; the plugin had the same shape in sidebar.ts handleResumeSession). A resume now records a snooze point:
 * the session is next auto-paused 2 hours of further work after the resume.
 */
export const OVERTIME_AUTOPAUSE_MINUTES = 120;

/** Elapsed work minutes at which the auto-pause next fires. Infinity when no prescribed time resolves. */
export function overtimeThresholdMin(goalpostMin: number, snoozeFromMin: number | null | undefined): number {
  if (!(goalpostMin > 0)) return Infinity;
  const base = goalpostMin + OVERTIME_AUTOPAUSE_MINUTES;
  if (typeof snoozeFromMin !== 'number' || !Number.isFinite(snoozeFromMin)) return base;
  return Math.max(base, snoozeFromMin + OVERTIME_AUTOPAUSE_MINUTES);
}

/** True when the auto-pause should fire now. */
export function overtimeAutoPauseDue(
  elapsedMin: number,
  goalpostMin: number,
  snoozeFromMin: number | null | undefined,
): boolean {
  return elapsedMin > overtimeThresholdMin(goalpostMin, snoozeFromMin);
}
