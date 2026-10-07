import { expect, it, vi } from 'vitest';
import { nextSessionTime } from '../src/chart/TimeMapper';
import { barEndTime } from '../src/market-data/MarketTiming';
import { DemoProvider, DEMO_AS_OF } from '../src/market-data/DemoProvider';
import { normalizeYahooEvents, normalizeYahooResponse } from '../src/market-data/YahooNormalizer';
import { YahooProvider } from '../src/market-data/YahooProvider';
import { isYahooTimeframe, yahooIntervals } from '../src/market-data/YahooIntervals';
import { closedBars, type Bar, type Timeframe } from '../src/market-data/MarketDataProvider';

const bar = (time: number): Bar => ({
  time,
  open: 10,
  high: 11,
  low: 9,
  close: 10,
  volume: 100,
});

it('uses regular Eastern session schedules across intraday intervals and DST', () => {
  const fridayAfternoon = Date.parse('2026-03-06T20:30:00Z') / 1000;
  expect(nextSessionTime(fridayAfternoon, '1H')).toBe(
    Date.parse('2026-03-09T13:30:00Z') / 1000,
  );
  expect(nextSessionTime(Date.parse('2026-10-02T19:55:00Z') / 1000, '5m')).toBe(
    Date.parse('2026-10-05T13:30:00Z') / 1000,
  );
  expect(nextSessionTime(Date.parse('2026-10-02T19:45:00Z') / 1000, '15m')).toBe(
    Date.parse('2026-10-05T13:30:00Z') / 1000,
  );
  expect(nextSessionTime(Date.parse('2026-10-02T19:30:00Z') / 1000, '30m')).toBe(
    Date.parse('2026-10-05T13:30:00Z') / 1000,
  );
  expect(nextSessionTime(Date.parse('2026-10-02T17:30:00Z') / 1000, '4H')).toBe(
    Date.parse('2026-10-05T13:30:00Z') / 1000,
  );
});

it('advances daily and weekly whitespace on weekdays without inventing holidays', () => {
  expect(nextSessionTime(Date.parse('2026-10-02T00:00:00Z') / 1000, '1D')).toBe(
    Date.parse('2026-10-05T00:00:00Z') / 1000,
  );
  expect(nextSessionTime(Date.parse('2026-10-02T00:00:00Z') / 1000, '1W')).toBe(
    Date.parse('2026-10-09T00:00:00Z') / 1000,
  );
});

it('provides 2,500 deterministic regular-session Demo bars for all seven V1 timeframes', async () => {
  const demo = new DemoProvider();
  expect(demo.supportedTimeframes).toEqual(['5m', '15m', '30m', '1H', '4H', '1D', '1W']);
  for (const timeframe of demo.supportedTimeframes) {
    const first = await demo.getBars('AAPL', timeframe);
    const second = await demo.getBars('AAPL', timeframe);
    expect(first.bars).toHaveLength(2500);
    expect(first.bars).toEqual(second.bars);
    expect(first).toMatchObject({ dataState: 'simulated', cacheStatus: 'fresh' });
    expect(first.source).toContain('simulated');
    expect(first.asOf).toBe(DEMO_AS_OF);
    expect(barEndTime(first.bars.at(-1)!.time, timeframe)).toBeLessThan(DEMO_AS_OF);
  }
}, 30000);

it('filters Demo bars to inclusive range bounds and errors when the range contains no bars', async () => {
  const demo = new DemoProvider();
  const full = await demo.getBars('AAPL', '1D');
  const target = full.bars.at(-3)!;
  const ranged = await demo.getBars('aapl', '1D', { from: target.time, to: target.time });
  expect(ranged.bars).toEqual([target]);
  expect(ranged).toMatchObject({ asOf: full.asOf, source: full.source, latestBarAt: target.time });
  await expect(demo.getBars('AAPL', '1D', { from: full.bars.at(-1)!.time + 1 })).rejects.toThrow(
    'No Demo bars in requested range',
  );
  await expect(demo.getBars('AAPL', '1D', { from: 5, to: 4 })).rejects.toThrow(
    'Market data range is reversed',
  );
});

it('advertises only direct Yahoo intervals and keeps 4H unavailable', () => {
  const yahoo = new YahooProvider();
  expect(yahoo.supportedTimeframes).toEqual(['5m', '15m', '30m', '1H', '1D', '1W']);
  expect(yahooIntervals).toEqual({
    '5m': { interval: '5m', range: '1mo' },
    '15m': { interval: '15m', range: '1mo' },
    '30m': { interval: '30m', range: '1mo' },
    '1H': { interval: '60m', range: '3mo' },
    '1D': { interval: '1d', range: '5y' },
    '1W': { interval: '1wk', range: '10y' },
  });
  expect(isYahooTimeframe('4H')).toBe(false);
});

it('reports unavailable corporate events for Demo instead of returning an empty available feed', async () => {
  const demo = new DemoProvider();
  expect(demo.capabilities?.corporateEvents).toBe('unavailable');
  expect(await demo.getCorporateEvents('AAPL')).toMatchObject({
    status: 'unavailable',
    events: [],
    source: expect.stringContaining('does not provide corporate events'),
  });
});

it('filters Yahoo bars and events locally while preserving full-source as-of metadata', async () => {
  const yahoo = new YahooProvider();
  const fullBars = {
    bars: [bar(100), bar(200), bar(300)],
    source: 'Yahoo prototype source',
    session: 'regular' as const,
    delayed: true,
    adjusted: false,
    asOf: 1000,
    latestBarAt: 300,
    dataState: 'delayed' as const,
  };
  const fullEvents = {
    status: 'available' as const,
    events: [
      { symbol: 'AAPL', type: 'dividend' as const, time: 100, value: 0.2, source: 'Yahoo' },
      { symbol: 'AAPL', type: 'split' as const, time: 200, value: 4, source: 'Yahoo', numerator: 4, denominator: 1 },
      { symbol: 'AAPL', type: 'dividend' as const, time: 300, value: 0.3, source: 'Yahoo' },
    ],
    source: 'Yahoo event source',
    asOf: 2000,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(fullBars), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(fullEvents), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  try {
    const bars = await yahoo.getBars('aapl', '5m', { from: 200, to: 200 });
    expect(bars).toMatchObject({
      bars: [bar(200)],
      asOf: 1000,
      latestBarAt: 200,
      source: 'Yahoo prototype source',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('symbol=AAPL');
    const events = await yahoo.getCorporateEvents('aapl', { from: 150, to: 300 });
    expect(events).toMatchObject({
      status: 'available',
      asOf: 2000,
      source: 'Yahoo event source',
      events: [fullEvents.events[1], fullEvents.events[2]],
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('validates Yahoo inputs before fetch and rejects empty ranges and zero previous closes', async () => {
  const yahoo = new YahooProvider();
  const result = {
    bars: [bar(100), { ...bar(200), close: 1 }],
    source: 'Yahoo test source',
    session: 'regular' as const,
    delayed: true,
    adjusted: false,
    asOf: 1000,
    latestBarAt: 200,
    dataState: 'delayed' as const,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(result), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...result, bars: [{ ...bar(100), close: 0 }, { ...bar(200), close: 1 }] }),
        { status: 200 },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  try {
    await expect(yahoo.getBars('AAPL', '5m', { from: 300 })).rejects.toThrow(
      'No Yahoo bars in requested range',
    );
    await expect(yahoo.getBars('not a ticker', '5m')).rejects.toThrow();
    await expect(yahoo.getBars('AAPL', '5m', { from: 20, to: 10 })).rejects.toThrow(
      'Market data range is reversed',
    );
    await expect(yahoo.getBars('AAPL', '5m', { from: Number.NaN })).rejects.toThrow(
      'Market data range must contain finite timestamps',
    );
    await expect(yahoo.getBars('AAPL', '4H')).rejects.toThrow('Yahoo does not provide this timeframe');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(yahoo.getQuote('AAPL')).rejects.toThrow('previous close must be positive');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('normalizes only actual finite Yahoo dividend and split records', () => {
  const asOf = 1900000000;
  const events = normalizeYahooEvents(
    {
      chart: {
        result: [
          {
            events: {
              dividends: {
                'div-1': { date: 1700000000, amount: 0.24, currency: 'USD' },
                'div-2': { date: 1701000000, amount: 0.5 },
              },
              splits: {
                'split-1': { date: 1600000000, numerator: 4, denominator: 1 },
              },
            },
          },
        ],
      },
    },
    'aapl',
    asOf,
  );
  expect(events).toMatchObject({ status: 'available', source: expect.stringContaining('Yahoo'), asOf });
  if (events.status !== 'available') throw new Error('Expected available event response');
  expect(events.events).toEqual([
    {
      symbol: 'AAPL',
      type: 'split',
      time: 1600000000,
      value: 4,
      source: expect.stringContaining('Yahoo'),
      numerator: 4,
      denominator: 1,
    },
    {
      symbol: 'AAPL',
      type: 'dividend',
      time: 1700000000,
      value: 0.24,
      source: expect.stringContaining('Yahoo'),
      currency: 'USD',
    },
    {
      symbol: 'AAPL',
      type: 'dividend',
      time: 1701000000,
      value: 0.5,
      source: expect.stringContaining('Yahoo'),
    },
  ]);
  expect(() =>
    normalizeYahooEvents(
      { chart: { result: [{ events: { splits: { bad: { date: 1600000000, numerator: 4, denominator: 0 } } } }] } },
      'AAPL',
      asOf,
    ),
  ).toThrow();
  expect(() => normalizeYahooEvents({ chart: { result: null } }, 'AAPL', asOf)).toThrow();
});

it('rejects Yahoo rows with negative or inconsistent OHLCV values', () => {
  const response = (row: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }) => ({
    chart: {
      result: [
        {
          timestamp: [1700000000],
          indicators: {
            quote: [
              {
                open: [row.open],
                high: [row.high],
                low: [row.low],
                close: [row.close],
                volume: [row.volume],
              },
            ],
          },
        },
      ],
    },
  });
  expect(() => normalizeYahooResponse(response({ open: 10, high: 9, low: 8, close: 9, volume: 1 }))).toThrow(
    'Invalid Yahoo OHLCV values',
  );
  expect(() => normalizeYahooResponse(response({ open: -1, high: 1, low: -2, close: 0, volume: 1 }))).toThrow(
    'Invalid Yahoo OHLCV values',
  );
  expect(() => normalizeYahooResponse(response({ open: 10, high: 11, low: 9, close: 10, volume: -1 }))).toThrow(
    'Invalid Yahoo OHLCV values',
  );
});

it('does not treat a forming intraday, daily, or weekly bar as closed', () => {
  const hourlyTime = Date.parse('2026-10-05T19:30:00Z') / 1000;
  const dailyTime = Date.parse('2026-10-05T00:00:00Z') / 1000;
  const weeklyTime = Date.parse('2026-09-28T00:00:00Z') / 1000;
  const hourlyEnd = Date.parse('2026-10-05T20:00:00Z') / 1000;
  const weeklyEnd = Date.parse('2026-10-02T20:00:00Z') / 1000;

  expect(barEndTime(hourlyTime, '1H')).toBe(hourlyEnd);
  expect(closedBars({ bars: [bar(hourlyTime)] }, '1H', hourlyEnd - 1)).toEqual([]);
  expect(closedBars({ bars: [bar(hourlyTime)] }, '1H', hourlyEnd)).toHaveLength(1);
  expect(closedBars({ bars: [bar(dailyTime)] }, '1D', hourlyEnd - 1)).toEqual([]);
  expect(closedBars({ bars: [bar(dailyTime)] }, '1D', hourlyEnd)).toHaveLength(1);
  expect(barEndTime(weeklyTime, '1W')).toBe(weeklyEnd);
  expect(closedBars({ bars: [bar(weeklyTime)] }, '1W', weeklyEnd - 1)).toEqual([]);
  expect(closedBars({ bars: [bar(weeklyTime)] }, '1W', weeklyEnd)).toHaveLength(1);
  expect(isYahooTimeframe('4H' as Timeframe)).toBe(false);
});
