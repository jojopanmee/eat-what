// Read only simple weekly OpenStreetMap hours. Anything with exceptions stays unknown.
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const unknown = hours => ({ state: 'unknown', label: hours ? 'Check opening hours' : 'Hours not listed' });
const minute = value => {
  const [hour, min] = value.split(':').map(Number);
  return Number.isInteger(hour) && Number.isInteger(min) && hour >= 0 && hour <= 24 && min >= 0 && min < 60 && (hour !== 24 || min === 0) ? hour * 60 + min : null;
};
const dayNumbers = value => {
  const found = new Set();
  for (const part of value.split(',')) {
    const [start, end] = part.trim().split('-');
    const a = DAYS.indexOf(start), b = end ? DAYS.indexOf(end) : a;
    if (a < 0 || b < 0) return null;
    for (let index = a; ; index = (index + 1) % 7) {
      found.add(index);
      if (index === b) break;
    }
  }
  return found;
};

export function openingHoursStatus(hours, date = new Date(), timeZone = 'Asia/Kuala_Lumpur') {
  if (!hours || !timeZone) return unknown(hours);
  if (hours.trim() === '24/7') return { state: 'open', label: 'Listed open now' };
  const rules = [];
  for (const raw of hours.split(';')) {
    const match = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/.exec(raw.trim());
    if (!match) return unknown(hours);
    const days = dayNumbers(match[1]);
    if (!days) return unknown(hours);
    for (const span of match[2].split(',')) {
      const [startText, endText] = span.split('-');
      const start = minute(startText), end = minute(endText);
      if (start === null || end === null || start === end) return unknown(hours);
      rules.push({ days, start, end });
    }
  }
  if (!rules.length) return unknown(hours);
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
    const now = Number(parts.hour) * 60 + Number(parts.minute);
    if (day < 0 || !Number.isFinite(now)) return unknown(hours);
    const open = rules.some(rule => rule.start < rule.end ? rule.days.has(day) && now >= rule.start && now < rule.end : rule.days.has(day) && now >= rule.start || rule.days.has((day + 6) % 7) && now < rule.end);
    return { state: open ? 'open' : 'closed', label: open ? 'Listed open now' : 'Listed closed now' };
  } catch { return unknown(hours); }
}
