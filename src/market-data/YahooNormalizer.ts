import { z } from 'zod';
import {
  normalizeSymbol,
  type Bar,
  type BarResult,
  type CorporateEvent,
  type CorporateEventsResult,
  type Timeframe,
} from './MarketDataProvider';
const prices = z.array(z.number().finite().nullable());
const dividendSchema = z.object({
  amount: z.number().finite(),
  date: z.number().int().positive(),
  currency: z.string().optional(),
});
const splitSchema = z.object({
  date: z.number().int().positive(),
  numerator: z.number().finite().positive(),
  denominator: z.number().finite().positive(),
});
const responseSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string(),
            currency: z.string().optional(),
            regularMarketPrice: z.number().finite().positive().optional(),
            regularMarketTime: z.number().int().positive().optional(),
          }).optional(),
          timestamp: z.array(z.number().int().positive()),
          indicators: z.object({
            quote: z.array(
              z.object({
                open: prices,
                high: prices,
                low: prices,
                close: prices,
                volume: prices.optional(),
              }),
            ),
          }),
        }),
      )
      .nullable(),
  }),
});
const eventsResponseSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          events: z
            .object({
              dividends: z.record(z.string(), dividendSchema).optional(),
              splits: z.record(z.string(), splitSchema).optional(),
            })
            .optional(),
        }),
      )
      .nullable(),
  }),
});
export const YAHOO_SOURCE = 'Yahoo unofficial prototype · delayed / as-of data';
/** Unofficial response structure stays entirely inside the provider boundary. */
export function normalizeYahooResponse(raw: unknown, asOf = Date.now() / 1000, timeframe?: Timeframe, expectedSymbol?: string): BarResult {
  if (!Number.isFinite(asOf) || asOf <= 0) throw new Error('Invalid Yahoo retrieval time');
  const result = responseSchema.parse(raw).chart.result?.[0],
    q = result?.indicators.quote[0];
  if (!result || !q) throw new Error('No data');
  if (expectedSymbol && result.meta?.symbol !== normalizeSymbol(expectedSymbol)) throw new Error('Yahoo response symbol mismatch');
  if (result.meta?.currency && result.meta.currency !== 'USD') throw new Error('Only USD market data is supported');
  const byTime = new Map<number, Bar>();
  const originalTimes = new Map<number, number>();
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = q.open[i],
      high = q.high[i],
      low = q.low[i],
      close = q.close[i];
    if (open == null || high == null || low == null || close == null) continue;
    // Keep the normalized Bar shape stable: Yahoo omits volume in some intervals,
    // and this prototype retains its established zero fallback for that field.
    const volume = q.volume?.[i] ?? 0;
    if (
      open < 0 ||
      high < 0 ||
      low < 0 ||
      close < 0 ||
      volume < 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close)
    ) {
      throw new Error(`Invalid Yahoo OHLCV values at ${result.timestamp[i]}`);
    }
    const originalTime = result.timestamp[i];
    const date = new Date(originalTime * 1000);
    const time = timeframe === '1M'
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000
      : timeframe === '1W'
        ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (date.getUTCDay() + 6) % 7) / 1000
        : originalTime;
    // Native weekly/monthly responses append a latest-session row after the
    // aggregate. Keep the earliest source timestamp for a period: summing or
    // replacing it would double count or lose the aggregate's OHLC/volume.
    if ((timeframe === '1M' || timeframe === '1W') && (originalTimes.get(time) ?? Infinity) < originalTime) continue;
    originalTimes.set(time, originalTime);
    byTime.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  const bars = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (!bars.length) throw new Error('No valid bars');
  // Yahoo's quote OHLC is already split-adjusted. adjclose also includes dividend
  // adjustment and is intentionally not used. Never divide by events.splits again.
  const verifiedBasis = !!result.meta;
  const meta = result.meta;
  const latest = bars.at(-1)!;
  const metaTime = meta?.regularMarketTime;
  const metaPrice = meta?.regularMarketPrice;
  const useMeta = !!metaTime && !!metaPrice && metaTime >= latest.time && metaTime <= asOf + 300;
  const quoteTime = useMeta ? metaTime : latest.time;
  const quotePrice = useMeta ? metaPrice : latest.close;
  const sameDay = new Date(quoteTime * 1000).toISOString().slice(0, 10) === new Date(latest.time * 1000).toISOString().slice(0, 10);
  const previous = sameDay ? bars.at(-2)?.close : latest.close;
  const quote = meta && timeframe === '1D' && previous && previous > 0 ? {
    symbol: normalizeSymbol(meta.symbol), price: quotePrice, change: quotePrice - previous,
    changePercent: (quotePrice / previous - 1) * 100, asOf: quoteTime,
    source: YAHOO_SOURCE, dataState: 'delayed' as const, retrievedAt: asOf, cacheStatus: 'fresh' as const,
  } : undefined;
  return {
    bars,
    source: YAHOO_SOURCE,
    session: 'regular',
    delayed: true,
    adjusted: verifiedBasis,
    priceBasis: verifiedBasis ? 'split-adjusted' : 'unknown',
    ...(quote ? { quote } : {}),
    asOf,
    latestBarAt: bars.at(-1)!.time,
    dataState: 'delayed',
    cacheStatus: 'fresh',
  };
}

/** Normalize only actual Yahoo corporate-event records; absent records remain a valid empty list. */
export function normalizeYahooEvents(
  raw: unknown,
  symbol: string,
  asOf = Date.now() / 1000,
): CorporateEventsResult {
  if (!Number.isFinite(asOf) || asOf <= 0) throw new Error('Invalid Yahoo retrieval time');
  const result = eventsResponseSchema.parse(raw).chart.result?.[0];
  if (!result) throw new Error('No corporate event data');
  const normalizedSymbol = normalizeSymbol(symbol);
  const events: CorporateEvent[] = [];
  for (const dividend of Object.values(result.events?.dividends ?? {})) {
    const event = {
      symbol: normalizedSymbol,
      type: 'dividend' as const,
      time: dividend.date,
      value: dividend.amount,
      source: YAHOO_SOURCE,
      ...(dividend.currency ? { currency: dividend.currency } : {}),
    };
    if (![event.time, event.value].every(Number.isFinite)) throw new Error('Invalid Yahoo dividend');
    events.push(event);
  }
  for (const split of Object.values(result.events?.splits ?? {})) {
    const value = split.numerator / split.denominator;
    const event = {
      symbol: normalizedSymbol,
      type: 'split' as const,
      time: split.date,
      value,
      source: YAHOO_SOURCE,
      numerator: split.numerator,
      denominator: split.denominator,
    };
    if (![event.time, event.value].every(Number.isFinite)) throw new Error('Invalid Yahoo split');
    events.push(event);
  }
  events.sort((a, b) => a.time - b.time || a.type.localeCompare(b.type));
  return { status: 'available', events, source: YAHOO_SOURCE, asOf };
}
