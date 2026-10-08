import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { normalizeYahooEvents, normalizeYahooResponse } from '../src/market-data/YahooNormalizer';
import { SnapshotProvider } from '../src/market-data/SnapshotProvider';
import { snapshotSchema } from '../src/market-data/SnapshotSchema';
import { CachedMarketDataProvider } from '../src/market-data/CachedMarketDataProvider';
import type { MarketDataProvider } from '../src/market-data/MarketDataProvider';

const asOf = Date.parse('2026-10-07T12:00:00Z') / 1000;
function actual(symbol: string) { return JSON.parse(readFileSync(new URL(`./fixtures/market/${symbol}.json`, import.meta.url), 'utf8')); }
function snapshot(symbol = 'SMCI') {
  const raw = actual(symbol);
  const daily = normalizeYahooResponse(raw, asOf, '1D', symbol);
  return snapshotSchema.parse({ version: 2, symbol, generatedAt: asOf, results: { '1D': daily }, quote: daily.quote, events: normalizeYahooEvents(raw, symbol, asOf) });
}
afterEach(() => vi.unstubAllGlobals());

it.each(['SMCI', 'NFLX'])('preserves actual already split-adjusted %s OHLC and volume, without a second split division', symbol => {
  const raw = actual(symbol);
  const source = raw.chart.result[0];
  const normalized = normalizeYahooResponse(raw, asOf, '1D', symbol);
  expect(normalized.priceBasis).toBe('split-adjusted');
  expect(normalized.adjusted).toBe(true);
  expect(normalized.bars.map(b => b.close)).toEqual(source.indicators.quote[0].close);
  expect(normalized.bars.map(b => b.volume)).toEqual(source.indicators.quote[0].volume);
  expect(normalized.quote!.price).toBe(source.meta.regularMarketPrice);
  expect(normalized.quote!.asOf).toBe(source.meta.regularMarketTime);
  expect(Math.abs(normalized.bars.at(-1)!.close - normalized.quote!.price)).toBeLessThan(0.001);
  expect(normalizeYahooEvents(raw, symbol, asOf).events.find(e => e.type === 'split')).toMatchObject({ numerator: 10, denominator: 1, value: 10 });
  expect(normalized.bars[0].close).toBeGreaterThan(10);
});

it('does not confuse dividend-adjusted adjclose or chartPreviousClose with current prices', () => {
  const raw = actual('NFLX');
  raw.chart.result[0].indicators.adjclose[0].adjclose = raw.chart.result[0].indicators.quote[0].close.map((c: number) => c / 2);
  raw.chart.result[0].meta.chartPreviousClose = 5000;
  const result = normalizeYahooResponse(raw, asOf, '1D', 'NFLX');
  expect(result.bars.at(-1)!.close).toBeCloseTo(68.69);
  const previous = result.bars.at(-2)!.close;
  expect(result.quote!.changePercent).toBeCloseTo((68.69 / previous - 1) * 100);
  expect(() => normalizeYahooResponse(raw, asOf, '1D', 'SMCI')).toThrow('symbol mismatch');
});

it('canonicalizes native monthly periods without rewriting their OHLC', () => {
  const raw = actual('NFLX');
  raw.chart.result[0].timestamp = [Date.parse('2026-08-03T13:30Z') / 1000, Date.parse('2026-09-01T13:30Z') / 1000];
  const result = normalizeYahooResponse(raw, asOf, '1M', 'NFLX');
  expect(result.bars.map(b => new Date(b.time * 1000).toISOString())).toEqual(['2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']);
  expect(result.bars.map(b => b.close)).toEqual(raw.chart.result[0].indicators.quote[0].close.slice(0, 2));
});

it.each(['SMCI', 'NFLX'])('retains native %s monthly/weekly aggregates and discards appended session rows', symbol => {
  for (const [interval, timeframe] of [['1mo', '1M'], ['1wk', '1W']] as const) {
    const raw = JSON.parse(readFileSync(new URL(`./fixtures/market/${symbol}-${interval}.json`, import.meta.url), 'utf8'));
    const original = raw.chart.result[0];
    const result = normalizeYahooResponse(raw, asOf, timeframe, symbol);
    expect(result.bars).toHaveLength(original.timestamp.length - 1);
    const aggregateIndex = original.timestamp.length - 2;
    expect(result.bars.at(-1)).toMatchObject(Object.fromEntries(Object.entries(original.indicators.quote[0]).map(([key, values]) => [key, (values as number[])[aggregateIndex]])));
    expect(result.bars.at(-1)!.volume).toBeGreaterThan(original.indicators.quote[0].volume.at(-1));
    if (timeframe === '1M') expect(new Date(result.bars.at(-1)!.time * 1000).getUTCDate()).toBe(1);
    else expect(new Date(result.bars.at(-1)!.time * 1000).getUTCDay()).toBe(1);
  }
});

it('loads real snapshots on the project path, deduplicates, filters ranges, and labels aged data', async () => {
  const pack = snapshot();
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(pack), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const provider = new SnapshotProvider('/lightweight-drawing-lab/market-data/', () => (asOf + 8000) * 1000);
  const [bars, quote, events] = await Promise.all([provider.getBars('smci', '1D'), provider.getQuote('SMCI'), provider.getCorporateEvents('SMCI')]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]).toEqual(['/lightweight-drawing-lab/market-data/SMCI.json', { cache: 'no-cache' }]);
  expect(bars.source).toContain('超過 2 小時');
  expect(quote).toMatchObject({ price: 43.46, dataState: 'delayed' });
  expect(events.events.some(e => e.type === 'split')).toBe(true);
  bars.bars[0].close = 999;
  const filtered = await provider.getBars('SMCI', '1D', { from: pack.results['1D']!.bars.at(-1)!.time });
  expect(filtered.bars).toHaveLength(1);
  await expect(provider.getBars('SMCI', '1W')).rejects.toThrow('暫無可靠快照');
});

it('does not replace missing, mismatched, malformed, or future snapshot data with Demo', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  await expect(new SnapshotProvider('/market/').getBars('NOTFOUND', '1D')).rejects.toThrow('不會改用模擬價格');
  for (const pack of [ { ...snapshot(), symbol: 'NFLX' }, { ...snapshot(), generatedAt: asOf + 10000 } ]) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(pack), { status: 200 })));
    await expect(new SnapshotProvider('/market/', () => asOf * 1000).getQuote('SMCI')).rejects.toThrow();
  }
});

it('separates caches when normalization/adjustment basis versions change', async () => {
  const dbName = `basis-${Math.random()}`;
  let calls = 0;
  const base: MarketDataProvider = { id: 'yahoo', supportedTimeframes: ['1D'], getBars: async () => { calls++; return normalizeYahooResponse(actual('SMCI'), asOf, '1D', 'SMCI'); }, getQuote: async () => snapshot().quote };
  await new CachedMarketDataProvider(base, { dbName }).getBars('SMCI', '1D');
  await new CachedMarketDataProvider({ ...base, cacheVersion: 'split-basis-v1' }, { dbName }).getBars('SMCI', '1D');
  expect(calls).toBe(2);
});
