import type { Bar } from '../market-data/MarketDataProvider';

export function volume(bars: readonly Bar[]): { time: number; value: number }[] {
  return bars.map((bar) => ({ time: bar.time, value: bar.volume }));
}
