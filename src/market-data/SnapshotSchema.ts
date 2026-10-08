import { z } from 'zod';
import { timeframes } from './MarketDataProvider';

const number = z.number().finite();
const timestamp = number.int().positive();
const bar = z.object({ time: timestamp, open: number.nonnegative(), high: number.nonnegative(), low: number.nonnegative(), close: number.nonnegative(), volume: number.nonnegative() })
  .refine(b => b.low <= Math.min(b.open, b.close) && b.high >= Math.max(b.open, b.close) && b.low <= b.high, 'Invalid OHLC');
const quote = z.object({ symbol: z.string(), price: number.positive(), change: number, changePercent: number, asOf: timestamp, source: z.string(), dataState: z.literal('delayed'), retrievedAt: number.positive(), cacheStatus: z.enum(['fresh', 'cached', 'stale']).optional() });
const bars = z.object({ bars: z.array(bar).min(1).max(10000), source: z.string(), session: z.literal('regular'), delayed: z.literal(true), adjusted: z.literal(true), priceBasis: z.literal('split-adjusted'), asOf: number.positive(), latestBarAt: timestamp, dataState: z.literal('delayed'), cacheStatus: z.enum(['fresh', 'cached', 'stale']).optional(), quote: quote.optional() })
  .refine(r => r.bars.every((b, i) => (!i || b.time > r.bars[i - 1].time) && b.time <= r.asOf + 300) && r.latestBarAt === r.bars.at(-1)!.time, 'Invalid bar timeline');
const event = z.object({ symbol: z.string(), type: z.enum(['split', 'dividend']), time: timestamp, value: number, source: z.string(), currency: z.string().optional(), numerator: number.positive().optional(), denominator: number.positive().optional() })
  .refine(e => e.type !== 'split' || !!e.numerator && !!e.denominator && Math.abs(e.value - e.numerator / e.denominator) < 1e-9, 'Invalid split ratio');
export const snapshotSchema = z.object({
  version: z.literal(2), symbol: z.string().regex(/^[A-Z][A-Z0-9.^-]{0,14}$/), generatedAt: number.positive(),
  results: z.partialRecord(z.enum(timeframes), bars), quote,
  events: z.object({ status: z.literal('available'), events: z.array(event), source: z.string(), asOf: number.positive() }),
}).refine(s => s.quote.symbol === s.symbol && s.events.events.every(e => e.symbol === s.symbol) && Object.values(s.results).every(r => r.asOf <= s.generatedAt && (!r.quote || r.quote.symbol === s.symbol)), 'Snapshot ownership mismatch');
export type MarketSnapshot = z.infer<typeof snapshotSchema>;
