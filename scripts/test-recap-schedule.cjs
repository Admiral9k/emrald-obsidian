// S15 recap schedule: UTC <-> local conversion and date-only parsing.
// Run under a few zones: for tz in America/New_York Asia/Kolkata Pacific/Auckland UTC; do node scripts/test-digest-schedule.cjs $tz; done
if (process.argv[2]) process.env.TZ = process.argv[2]; // must be set before any Date is created
let esbuild; esbuild = require('esbuild');
const path = require('path');
const src = path.join(__dirname, '..', 'src/utils/digest-schedule.ts');
const out = esbuild.buildSync({ entryPoints: [src], bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
const m = { exports: {} }; new Function('module', 'exports', out)(m, m.exports);
const { utcSlotToLocal, localSlotToUtc, formatTime12, parseCalendarDate } = m.exports;
let fail = 0; const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const tz = process.env.TZ || 'system';
console.log('TZ =', tz);

// Round trip for every UTC day and every hour, on a summer and a winter reference date.
for (const ref of [new Date(2026, 6, 15, 12), new Date(2026, 10, 12, 12)]) {
  let bad = 0;
  for (let day = 0; day < 7; day++) for (let h = 0; h < 24; h++) {
    const utc = { day, time: String(h).padStart(2, '0') + ':00' };
    const back = localSlotToUtc(utcSlotToLocal(utc, ref), ref);
    if (back.day !== utc.day || back.time !== utc.time) bad++;
  }
  ok(bad === 0, 'round trip 168 slots, ref ' + ref.toDateString());
}
// Known case: Sunday 09:00 UTC, in winter (Nov 12 2026) New York is UTC-5.
if (tz === 'America/New_York') {
  const l = utcSlotToLocal({ day: 0, time: '09:00' }, new Date(2026, 10, 12, 12));
  ok(l.day === 0 && l.time === '04:00', 'NY: Sunday 09:00 UTC is Sunday 04:00 local');
  const e = utcSlotToLocal({ day: 0, time: '03:00' }, new Date(2026, 10, 12, 12));
  ok(e.day === 6 && e.time === '22:00', 'NY: Sunday 03:00 UTC is Saturday 22:00 local (weekday rolls back)');
  const u = localSlotToUtc({ day: 6, time: '22:00' }, new Date(2026, 10, 12, 12));
  ok(u.day === 0 && u.time === '03:00', 'NY: Saturday 22:00 local stores Sunday 03:00 UTC');
}
if (tz === 'Pacific/Auckland') {
  const l = utcSlotToLocal({ day: 6, time: '18:00' }, new Date(2026, 10, 12, 12));
  ok(l.day === 0, 'Auckland: Saturday 18:00 UTC is Sunday local (weekday rolls forward)');
}
ok(formatTime12('04:00') === '4:00 AM' && formatTime12('00:00') === '12:00 AM' && formatTime12('12:30') === '12:30 PM' && formatTime12('23:00') === '11:00 PM', 'formatTime12');
// Date-only strings are calendar dates, not UTC instants: the viewer must see the same day the API stored.
const d = parseCalendarDate('2026-11-01');
ok(d.getFullYear() === 2026 && d.getMonth() === 10 && d.getDate() === 1, 'date-only 2026-11-01 is Nov 1 local');
const iso = parseCalendarDate('2026-11-08T18:00:44.359711+00:00');
ok(iso instanceof Date && !Number.isNaN(iso.getTime()), 'full timestamps still parse as instants');
ok(parseCalendarDate('nonsense') === null, 'garbage returns null');
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
