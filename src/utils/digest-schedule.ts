// Recap (digest) schedule in the user's local time. S15, Devon ruling 11/12.
// The API stores day (0 = Sunday) and time in UTC and its scheduler fires on getUTCDay / getUTCHours,
// so a local view has to carry the weekday across midnight (UTC Sunday 03:00 is Saturday evening in the
// US). Conversions use the offset in force on the reference date, so across a daylight-saving change the
// same stored UTC slot reads one hour apart in local time; the stored value never moves.

export interface Slot {
  /** 0 = Sunday */
  day: number;
  /** 24-hour "HH:MM" */
  time: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseTime(time: string): { h: number; m: number } {
  const [h, m] = time.split(':');
  const hh = Number.parseInt(h ?? '', 10);
  const mm = Number.parseInt(m ?? '0', 10);
  return { h: Number.isFinite(hh) ? hh : 0, m: Number.isFinite(mm) ? mm : 0 };
}

/** The stored UTC slot, as the same moment in the viewer's local day and time. */
export function utcSlotToLocal(slot: Slot, now: Date = new Date()): Slot {
  const { h, m } = parseTime(slot.time);
  const baseUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offsetDays = (slot.day - new Date(baseUtc).getUTCDay() + 7) % 7;
  const d = new Date(baseUtc + offsetDays * 86400000 + h * 3600000 + m * 60000);
  return { day: d.getDay(), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** A slot the viewer picked in local time, as the UTC slot the API stores. */
export function localSlotToUtc(slot: Slot, now: Date = new Date()): Slot {
  const { h, m } = parseTime(slot.time);
  const offsetDays = (slot.day - now.getDay() + 7) % 7;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, h, m, 0, 0);
  return { day: d.getUTCDay(), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

/** "9:00 AM" from "09:00". */
export function formatTime12(time: string): string {
  const { h, m } = parseTime(time);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

/** Parse a date-only "YYYY-MM-DD" (or the date part of a longer ISO string) as a LOCAL calendar date. */
export function parseCalendarDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m && (value.length === 10)) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Settings store the weekday as a lowercase name; the API stores 0 = Sunday. */
export const DIGEST_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type DigestDay = typeof DIGEST_DAYS[number];
export const DIGEST_DAY_NAMES: string[] = DIGEST_DAYS.map(d => d.charAt(0).toUpperCase() + d.slice(1));
export const DIGEST_DAY_INDEX: Record<string, number> = Object.fromEntries(DIGEST_DAYS.map((d, i) => [d, i]));
