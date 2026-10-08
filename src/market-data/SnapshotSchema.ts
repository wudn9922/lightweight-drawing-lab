import { z } from 'zod';
import { timeframes } from './MarketDataProvider';

const number = z.number().finite();
const timestamp = number.int().positive();
const bar = z.object({ time: timestamp, open: number.nonnegative(), high: number.nonnegative(), low: number.nonnegative(), close: number.nonnegative(), volume: number.nonnegative() })
  .refine(b => b.low <= Math.min(b.open, b.close) && b.high >= Math.max(b.open, b.close) && b.low <= b.high, 'Invalid OHLC');
const quote = z.object({ symbol: z.string(), price: number.positive(), change: number, changePercent: number, asOf: timestamp, source: z.string(), dataState: z.literal('delayed'), retrievedAt: number.positive(), cacheStatus: z.enum(['fresh', 'cached', 'stale']).optional() });
const normalization = z.object({
  healedDailyClose: z.object({ method: z.literal('validated-regular-market-price'), time: timestamp, quoteAsOf: timestamp }).optional(),
  currentPeriod: z.object({
    method: z.literal('daily-ohlcv'), timeframe: z.enum(['1W', '1M']), periodStart: timestamp,
    firstDailyTime: timestamp, lastDailyTime: timestamp, dailyCount: z.number().int().positive(),
    quoteAsOf: timestamp, native: bar.optional(),
  }).optional(),
}).optional();
const bars = z.object({ bars: z.array(bar).min(1).max(10000), source: z.string(), session: z.literal('regular'), delayed: z.literal(true), adjusted: z.literal(true), priceBasis: z.literal('split-adjusted'), asOf: number.positive(), latestBarAt: timestamp, dataState: z.literal('delayed'), cacheStatus: z.enum(['fresh', 'cached', 'stale']).optional(), quote: quote.optional(), normalization })
  .refine(r => r.bars.every((b, i) => (!i || b.time > r.bars[i - 1].time) && b.time <= r.asOf + 300) && r.latestBarAt === r.bars.at(-1)!.time, 'Invalid bar timeline');
const event = z.object({ symbol: z.string(), type: z.enum(['split', 'dividend']), time: timestamp, value: number, source: z.string(), currency: z.string().optional(), numerator: number.positive().optional(), denominator: number.positive().optional() })
  .refine(e => e.type !== 'split' || !!e.numerator && !!e.denominator && Math.abs(e.value - e.numerator / e.denominator) < 1e-9, 'Invalid split ratio');
export const snapshotSchema = z.object({
  version: z.literal(3), symbol: z.string().regex(/^[A-Z][A-Z0-9.^-]{0,14}$/), generatedAt: number.positive(),
  results: z.partialRecord(z.enum(timeframes), bars), quote,
  events: z.object({ status: z.literal('available'), events: z.array(event), source: z.string(), asOf: number.positive() }),
}).refine(s => {
  if (s.quote.symbol !== s.symbol || !s.events.events.every(e => e.symbol === s.symbol) || !Object.values(s.results).every(r => r.asOf <= s.generatedAt && (!r.quote || r.quote.symbol === s.symbol))) return false;
  const daily = s.results['1D'];
  if (!daily) return false;
  const dailyLatest = daily.bars.at(-1)!;
  const utcDate = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
  if (utcDate(dailyLatest.time) !== utcDate(s.quote.asOf) || Math.abs(dailyLatest.close - s.quote.price) > 0.01) return false;
  const periodStart = (time: number, timeframe: '1W' | '1M') => {
    const date = new Date(time * 1000);
    return timeframe === '1M'
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (date.getUTCDay() + 6) % 7) / 1000;
  };
  for (const timeframe of ['1W', '1M'] as const) {
    const result = s.results[timeframe];
    if (!result) continue;
    const latest = result.bars.at(-1)!;
    if (periodStart(latest.time, timeframe) !== periodStart(s.quote.asOf, timeframe) || Math.abs(latest.close - s.quote.price) > 0.01) return false;
    const provenance = result.normalization?.currentPeriod;
    if (provenance && (provenance.timeframe !== timeframe || provenance.periodStart !== latest.time)) return false;
  }
  return true;
}, 'Snapshot ownership or current quote alignment mismatch');
export type MarketSnapshot = z.infer<typeof snapshotSchema>;
