import type { Bar, BarResult, Timeframe } from './MarketDataProvider';
import { intervalSeconds } from './MarketDataProvider';

const easternParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsAt(epochSeconds: number): Record<string, string> {
  return Object.fromEntries(
    easternParts.formatToParts(new Date(epochSeconds * 1000)).map((part) => [part.type, part.value]),
  );
}

/** Convert a regular-session Eastern wall time to Unix seconds, including DST. */
function easternEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted + 5 * 60 * 60 * 1000;
  for (let i = 0; i < 3; i++) {
    const part = partsAt(guess / 1000);
    const observed = Date.UTC(
      Number(part.year),
      Number(part.month) - 1,
      Number(part.day),
      Number(part.hour),
      Number(part.minute),
    );
    guess += wanted - observed;
  }
  return guess / 1000;
}

/** Conservative scheduled end of one regular-session bar; holidays are unknown. */
export function barEndTime(time: number, timeframe: Timeframe): number {
  if (timeframe === '1M') {
    const date = new Date(time * 1000);
    const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return easternEpoch(
      nextMonth.getUTCFullYear(),
      nextMonth.getUTCMonth() + 1,
      1,
      0,
      0,
    );
  }
  if (timeframe === '1D' || timeframe === '1W') {
    const date = new Date(time * 1000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const sessionDay =
      timeframe === '1D'
        ? new Date(Date.UTC(year, month, day))
        : new Date(Date.UTC(year, month, day + ((5 - date.getUTCDay() + 7) % 7)));
    return easternEpoch(
      sessionDay.getUTCFullYear(),
      sessionDay.getUTCMonth() + 1,
      sessionDay.getUTCDate(),
      16,
      0,
    );
  }

  const part = partsAt(time);
  const minuteOfDay = Number(part.hour) * 60 + Number(part.minute);
  if (
    part.weekday === 'Sat' ||
    part.weekday === 'Sun' ||
    minuteOfDay < 570 ||
    minuteOfDay >= 960
  ) {
    return Infinity;
  }
  const endMinute = Math.min(minuteOfDay + intervalSeconds[timeframe] / 60, 960);
  const dateArgs = [Number(part.year), Number(part.month), Number(part.day)] as const;
  return easternEpoch(
    dateArgs[0],
    dateArgs[1],
    dateArgs[2],
    Math.floor(endMinute / 60),
    endMinute % 60,
  );
}

/** Return bars with scheduled session ends no later than the supplied as-of time. */
export function closedBars(
  result: Pick<BarResult, 'bars'>,
  timeframe: Timeframe,
  asOf: number,
): Bar[] {
  return result.bars.filter((bar) => barEndTime(bar.time, timeframe) <= asOf);
}
