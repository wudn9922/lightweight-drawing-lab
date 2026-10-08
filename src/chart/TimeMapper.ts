import type { Bar, Timeframe } from '../market-data/MarketDataProvider';
import { intervalSeconds } from '../market-data/MarketDataProvider';
import type { Anchor } from '../drawing/DrawingModel';
const eastern = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** Regular-session schedule, weekends excluded. Holidays require a production exchange calendar. */
export function nextSessionTime(time: number, timeframe: Timeframe): number {
  if (timeframe === '1M') {
    const date = new Date(time * 1000);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000;
  }
  let next = time + intervalSeconds[timeframe];
  if (timeframe === '1D') {
    while ([0, 6].includes(new Date(next * 1000).getUTCDay())) next += 86400;
    return next;
  }
  if (timeframe === '1W') {
    while ([0, 6].includes(new Date(next * 1000).getUTCDay())) next += 86400;
    return next;
  }
  // All intraday intervals begin at 09:30 ET. A final bar may be shorter than
  // its nominal interval; jump across the closed session without scanning every
  // five minutes (Demo generates thousands of these timestamps).
  const p = Object.fromEntries(eastern.formatToParts(new Date(next * 1000)).map((x) => [x.type, x.value]));
  const minute = Number(p.hour) * 60 + Number(p.minute);
  if (p.weekday !== 'Sat' && p.weekday !== 'Sun' && minute >= 570 && minute < 960) return next;

  const date = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  if (p.weekday === 'Sat') date.setUTCDate(date.getUTCDate() + 2);
  else if (p.weekday === 'Sun') date.setUTCDate(date.getUTCDate() + 1);
  else if (minute >= 960) date.setUTCDate(date.getUTCDate() + 1);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return easternEpoch(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    9,
    30,
  );
}

function easternEpoch(year: number, month: number, day: number, hour: number, minute: number): number {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted + 5 * 60 * 60 * 1000;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      eastern.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const observed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    guess += wanted - observed;
  }
  return guess / 1000;
}

/** Public regular-session opening timestamp for a calendar date in Eastern time. */
export function regularSessionOpen(year: number, month: number, day: number): number {
  return easternEpoch(year, month, day, 9, 30);
}

function calendarMonthTime(anchor: number, monthOffset: number): number {
  const date = new Date(anchor * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1) / 1000;
}

/** Fractional month index relative to a UTC first-of-month anchor. */
function calendarMonthLogical(time: number, anchor: number): number {
  const anchorDate = new Date(anchor * 1000);
  const date = new Date(time * 1000);
  const monthOffset =
    (date.getUTCFullYear() - anchorDate.getUTCFullYear()) * 12 +
    date.getUTCMonth() - anchorDate.getUTCMonth();
  const lower = calendarMonthTime(anchor, monthOffset);
  const upper = calendarMonthTime(anchor, monthOffset + 1);
  return monthOffset + (time - lower) / (upper - lower);
}

/** Calendar-aware extrapolation around the buffered timestamps. */
function calendarMonthAtLogical(anchor: number, logicalOffset: number): number {
  const lowerMonth = Math.floor(logicalOffset);
  const fraction = logicalOffset - lowerMonth;
  const lower = calendarMonthTime(anchor, lowerMonth);
  const upper = calendarMonthTime(anchor, lowerMonth + 1);
  return lower + fraction * (upper - lower);
}

export class TimeMapper {
  readonly times: number[];
  readonly lastRealLogical: number;
  constructor(
    readonly bars: readonly Bar[],
    readonly timeframe: Timeframe,
    futureCount = 500,
  ) {
    this.times = bars.map((b) => b.time);
    this.lastRealLogical = bars.length - 1;
    for (let i = 0; i < futureCount && this.times.length; i++)
      this.times.push(nextSessionTime(this.times.at(-1)!, timeframe));
  }
  toTime(logical: number): number {
    if (!this.times.length) return 0;
    const i = Math.floor(logical),
      fraction = logical - i;
    if (i < 0) {
      if (this.timeframe === '1M') {
        return calendarMonthAtLogical(this.times[0], logical);
      }
      return this.times[0] + logical * intervalSeconds[this.timeframe];
    }
    if (i >= this.times.length - 1) {
      if (this.timeframe === '1M') {
        return calendarMonthAtLogical(this.times.at(-1)!, logical - (this.times.length - 1));
      }
      return (
        this.times.at(-1)! + (logical - this.times.length + 1) * intervalSeconds[this.timeframe]
      );
    }
    return this.times[i] + fraction * (this.times[i + 1] - this.times[i]);
  }
  toLogical(time: number): number {
    if (!this.times.length) return 0;
    if (time < this.times[0]) {
      return this.timeframe === '1M'
        ? calendarMonthLogical(time, this.times[0])
        : (time - this.times[0]) / intervalSeconds[this.timeframe];
    }
    const end = this.times.length - 1;
    if (time >= this.times[end]) {
      if (this.timeframe === '1M') {
        return end + calendarMonthLogical(time, this.times[end]);
      }
      return end + (time - this.times[end]) / intervalSeconds[this.timeframe];
    }
    let lo = 0,
      hi = end;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.times[mid] <= time) lo = mid;
      else hi = mid;
    }
    return lo + (time - this.times[lo]) / (this.times[hi] - this.times[lo]);
  }
  anchor(logical: number, price: number): Anchor {
    return { time: this.toTime(logical), logical, price, timeframe: this.timeframe };
  }
  futureWhitespace(): { time: number }[] {
    return this.times.slice(this.lastRealLogical + 1).map((time) => ({ time }));
  }
  isFuture(logical: number): boolean {
    return logical > this.lastRealLogical;
  }
}
