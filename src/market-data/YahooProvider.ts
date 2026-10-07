import type {
  CorporateEventsResult,
  MarketRange,
  MarketDataProvider,
  Timeframe,
  BarResult,
  Quote,
} from './MarketDataProvider';
import { filterBarsByRange, normalizeMarketRange, normalizeSymbol } from './MarketDataProvider';
import { MarketDataUnavailableError } from './ProviderErrors';
import { isYahooTimeframe } from './YahooIntervals';
import { STATIC_HOSTING } from '../app/HostingMode';

const STATIC_BACKEND_REQUIRED =
  'Yahoo 資料需要 backend；此 GitHub Pages 靜態部署沒有 Yahoo backend，請連接 backend 或手動選擇 Demo。';

export class YahooProvider implements MarketDataProvider {
  readonly id = 'yahoo';
  readonly supportedTimeframes = ['5m', '15m', '30m', '1H', '1D', '1W'] as const;
  readonly capabilities = { corporateEvents: 'available' } as const;
  async getBars(
    symbol: string,
    timeframe: Timeframe,
    range?: MarketRange,
    signal?: AbortSignal,
  ): Promise<BarResult> {
    if (STATIC_HOSTING) throw new MarketDataUnavailableError(STATIC_BACKEND_REQUIRED);
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedRange = normalizeMarketRange(range);
    if (!isYahooTimeframe(timeframe)) throw new Error('Yahoo does not provide this timeframe');
    const res = await fetch(
      `/api/yahoo?symbol=${encodeURIComponent(normalizedSymbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      { signal },
    );
    if (!res.ok) {
      if (res.status === 429 || [502, 503, 504].includes(res.status)) {
        throw new MarketDataUnavailableError('Yahoo prototype unavailable. 請切回 Demo 資料。');
      }
      throw new Error(`Yahoo request rejected (${res.status})`);
    }
    const result = (await res.json()) as BarResult;
    if (!result || !Array.isArray(result.bars) || typeof result.source !== 'string') {
      throw new Error('Yahoo returned invalid bar data');
    }
    const bars = filterBarsByRange(result.bars, normalizedRange);
    if (!bars.length) throw new Error('No Yahoo bars in requested range');
    return { ...result, bars, latestBarAt: bars.at(-1)!.time };
  }
  async getCorporateEvents(
    symbol: string,
    range?: MarketRange,
    signal?: AbortSignal,
  ): Promise<CorporateEventsResult> {
    if (STATIC_HOSTING) throw new MarketDataUnavailableError(STATIC_BACKEND_REQUIRED);
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedRange = normalizeMarketRange(range);
    const res = await fetch(`/api/yahoo/events?symbol=${encodeURIComponent(normalizedSymbol)}`, { signal });
    if (!res.ok) {
      if (res.status === 429 || [502, 503, 504].includes(res.status)) {
        throw new MarketDataUnavailableError('Yahoo corporate events unavailable.');
      }
      throw new Error(`Yahoo corporate events request rejected (${res.status})`);
    }
    const result = (await res.json()) as CorporateEventsResult;
    if (result.status === 'unavailable') return result;
    if (
      result.status !== 'available' ||
      !Array.isArray(result.events) ||
      !Number.isFinite(result.asOf) ||
      result.events.some((event) => event.symbol !== normalizedSymbol)
    ) {
      throw new Error('Yahoo returned invalid corporate event data');
    }
    const events = result.events.filter(
      (event) =>
        (normalizedRange?.from === undefined || event.time >= normalizedRange.from) &&
        (normalizedRange?.to === undefined || event.time <= normalizedRange.to),
    );
    return { ...result, events };
  }
  async getQuote(symbol: string, signal?: AbortSignal): Promise<Quote> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const result = await this.getBars(normalizedSymbol, '1D', undefined, signal);
    const { bars } = result;
    const a = bars.at(-1),
      b = bars.at(-2);
    if (!a || !b) throw new Error('Quote unavailable');
    if (b.close <= 0) throw new Error('Quote unavailable: previous close must be positive');
    const changePercent = (a.close / b.close - 1) * 100;
    if (!Number.isFinite(changePercent)) throw new Error('Quote unavailable: invalid close values');
    return {
      symbol: normalizedSymbol,
      price: a.close,
      change: a.close - b.close,
      changePercent,
      asOf: a.time,
      source: result.source,
      dataState: result.dataState ?? 'delayed',
      retrievedAt: result.asOf,
      cacheStatus: result.cacheStatus ?? 'fresh',
    };
  }
}
