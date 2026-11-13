// One rule for "does this user have a burnout score yet?", shared by the Overview card
// and the Burnout Monitor page (S15). The /burnout route returns a state ROW as soon as
// the account exists, so the row alone is not data: before this rule the Burnout page
// showed "All clear, 0/100" while the Overview said "No data". The score itself comes from
// D8 (stored 0 to 10, shown 0 to 100); an explicit numeric score on the state wins when
// present. An active episode counts as data even without a fresh D8.

export interface BurnoutStateLike {
  score?: number | null;
  episode_active?: boolean;
}

/** The 0 to 100 display score, or null when there is nothing to judge from. */
export function burnoutDisplayScore(
  state: BurnoutStateLike | null | undefined,
  d8: number | null | undefined,
): number | null {
  if (typeof state?.score === 'number') return state.score;
  if (typeof d8 === 'number') return d8 * 10;
  return null;
}

/** True when the Burnout page may show a verdict (score present, or an episode is active). */
export function hasBurnoutData(
  state: BurnoutStateLike | null | undefined,
  d8: number | null | undefined,
): boolean {
  return burnoutDisplayScore(state, d8) !== null || state?.episode_active === true;
}
