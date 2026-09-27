// Next-send helpers for the Today page. Works in the digest's own timezone without a date
// library: we read "now" as wall-clock parts in that zone and compare against schedule_time.

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function partsIn(tz, date = new Date()) {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
    return { wd: WD.indexOf(p.weekday), d: Number(p.day), minutes: Number(p.hour) * 60 + Number(p.minute) };
  } catch {
    return null;
  }
}

function tzShort(tz) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
    return p.find(x => x.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}

function fmtTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`;
}

/**
 * Returns { label, sortKey } for the digest's next send, or null when it has no schedule
 * or is paused. sortKey is "minutes from now" (approximate for monthly).
 */
export function nextSend(digest, fallbackTz) {
  if (!digest || digest.status === 'paused' || !digest.schedule_time) return null;
  const tz = digest.timezone || fallbackTz || 'America/New_York';
  const now = partsIn(tz);
  if (!now) return null;
  const [h, m] = String(digest.schedule_time).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const target = h * 60 + (m || 0);
  let daysAhead = 0;

  if (digest.frequency === 'weekly') {
    const want = digest.schedule_day_of_week ?? 1;
    daysAhead = (want - now.wd + 7) % 7;
    if (daysAhead === 0 && target <= now.minutes) daysAhead = 7;
  } else if (digest.frequency === 'monthly') {
    const want = digest.schedule_day_of_month ?? 1;
    daysAhead = want - now.d;
    if (daysAhead < 0 || (daysAhead === 0 && target <= now.minutes)) daysAhead += 30;
  } else {
    daysAhead = target > now.minutes ? 0 : 1;
  }

  const when = daysAhead === 0 ? 'Today' : daysAhead === 1 ? 'Tomorrow'
    : daysAhead < 7 ? WD_LONG[(now.wd + daysAhead) % 7]
    : `In ${daysAhead} days`;
  let local = null;
  try { local = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { local = null; }
  const zone = local && local !== tz ? ` ${tzShort(tz)}` : '';
  return { label: `${when} at ${fmtTime(digest.schedule_time)}${zone}`, sortKey: daysAhead * 1440 + target - now.minutes };
}
