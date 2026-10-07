import { it, expect, vi } from 'vitest';
import { HistogramSeries, LineSeries, type IChartApi } from 'lightweight-charts';
import { IndicatorEngine } from '../src/indicators/IndicatorEngine';
import type { IndicatorInstance, IndicatorType } from '../src/indicators/IndicatorRegistry';
import { ema } from '../src/indicators/ExponentialMovingAverage';
import { volume } from '../src/indicators/Volume';
import type { Bar } from '../src/market-data/MarketDataProvider';

const bars: Bar[] = [
  { time: 10, open: 1, high: 3, low: 0, close: 2, volume: 100 },
  { time: 20, open: 3, high: 5, low: 2, close: 4, volume: 200 },
  { time: 30, open: 5, high: 7, low: 4, close: 6, volume: 300 },
  { time: 40, open: 7, high: 9, low: 6, close: 8, volume: 400 },
  { time: 50, open: 9, high: 11, low: 8, close: 10, volume: 500 },
];

it('EMA seeds with the first period SMA, then uses a finite lookback and the selected source', () => {
  expect(ema(bars, 3, 'high')).toEqual([
    { time: 30, value: 5 },
    { time: 40, value: 7 },
    { time: 50, value: 9 },
  ]);
  expect(ema(bars.slice(0, 2), 3)).toEqual([]);
  expect(() => ema(bars, 0)).toThrow('EMA period must be a positive integer');
});

it('Volume returns each bar volume with its original timestamp', () => {
  expect(volume(bars)).toEqual([
    { time: 10, value: 100 },
    { time: 20, value: 200 },
    { time: 30, value: 300 },
    { time: 40, value: 400 },
    { time: 50, value: 500 },
  ]);
});

function instance(type: IndicatorType, id: string): IndicatorInstance {
  return {
    id,
    symbol: 'AAPL',
    type,
    period: type === 'Volume' ? 1 : 3,
    source: 'close',
    visible: true,
    locked: false,
    lineWidth: 2,
    color: '#f0b35b',
    scope: {},
  };
}

it('IndicatorEngine registers the right series, uses per-volume scales, and caches unchanged data', () => {
  const addedTypes: unknown[] = [];
  const scaleOptions: unknown[] = [];
  const created: { setData: ReturnType<typeof vi.fn>; applyOptions: ReturnType<typeof vi.fn> }[] =
    [];
  const chart = {
    addSeries: vi.fn((type: unknown) => {
      addedTypes.push(type);
      const api = {
        setData: vi.fn(),
        applyOptions: vi.fn(),
        priceScale: () => ({
          applyOptions: vi.fn((options: unknown) => scaleOptions.push(options)),
        }),
      };
      created.push(api);
      return api;
    }),
    removeSeries: vi.fn(),
  } as unknown as IChartApi;
  const engine = new IndicatorEngine(chart);
  const smaInstance = instance('SMA', 'ma-id');
  const volumeInstance = instance('Volume', 'volume-id');

  engine.sync([smaInstance, volumeInstance], bars, '1D', 1);
  expect(addedTypes).toEqual([LineSeries, HistogramSeries]);
  expect(scaleOptions).toEqual([{ scaleMargins: { top: 0.88, bottom: 0 } }]);
  expect(created[1].setData).toHaveBeenCalledWith(
    bars.map((bar) => ({ time: bar.time, value: bar.volume })),
  );
  expect(engine.registry.get('Volume')?.calculate(bars, 99, 'high')).toEqual(
    bars.map((bar) => ({ time: bar.time, value: bar.volume })),
  );

  engine.sync([{ ...smaInstance, color: '#ffffff' }, volumeInstance], bars, '1D', 1);
  expect(created[0].setData).toHaveBeenCalledTimes(1);
  expect(created[1].setData).toHaveBeenCalledTimes(1);

  engine.sync([instance('EMA', 'ma-id'), volumeInstance], bars, '1D', 1);
  expect(chart.removeSeries).toHaveBeenCalledTimes(1);
  expect(addedTypes).toHaveLength(3);
  expect(addedTypes[2]).toBe(LineSeries);
  engine.clear();
  expect(chart.removeSeries).toHaveBeenCalledTimes(3);
});
