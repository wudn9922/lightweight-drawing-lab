import { snapshotSchema, type MarketSnapshot } from './SnapshotSchema';
import { filterBarsByRange, normalizeMarketRange, normalizeSymbol, type MarketDataProvider, type MarketRange, type Timeframe } from './MarketDataProvider';
import { MarketDataUnavailableError } from './ProviderErrors';

/** Same-origin real, delayed snapshots. No CORS proxy, secret, or invented fallback. */
export class SnapshotProvider implements MarketDataProvider {
  readonly id = 'snapshot';
  readonly cacheVersion = 'split-basis-v2-calendar-aggregate';
  readonly supportedTimeframes = ['5m', '15m', '30m', '1H', '1D', '1W', '1M'] as const;
  readonly capabilities = { corporateEvents: 'available' } as const;
  private pending = new Map<string, Promise<MarketSnapshot>>();
  private recent = new Map<string, { at: number; data: MarketSnapshot }>();
  constructor(private base = `${import.meta.env.BASE_URL}market-data/`, private now = Date.now) {}
  private async load(symbolInput: string, signal?: AbortSignal) {
    const symbol = normalizeSymbol(symbolInput);
    signal?.throwIfAborted();
    const cached = this.recent.get(symbol);
    if (cached && this.now() - cached.at < 60000) return structuredClone(cached.data);
    let request = this.pending.get(symbol);
    if (!request) {
      request = (async () => {
        const response = await fetch(`${this.base}${encodeURIComponent(symbol)}.json`, { cache: 'no-cache' });
        if (!response.ok) throw new MarketDataUnavailableError(`${symbol} 暫無延遲快照。可用股票見資料來源說明；不會改用模擬價格。`);
        const parsed = snapshotSchema.parse(await response.json());
        if (parsed.symbol !== symbol) throw new Error('Snapshot symbol mismatch');
        if (parsed.generatedAt > this.now() / 1000 + 300) throw new Error('Snapshot generation time is in the future');
        this.recent.set(symbol, { at: this.now(), data: parsed });
        if (this.recent.size > 50) this.recent.delete(this.recent.keys().next().value!);
        return parsed;
      })();
      this.pending.set(symbol, request);
      void request.finally(() => this.pending.delete(symbol)).catch(() => undefined);
    }
    const data = await request;
    signal?.throwIfAborted();
    return structuredClone(data);
  }
  private source(generatedAt: number, asOf: number) {
    const age = this.now() / 1000 - generatedAt;
    return `Yahoo 延遲快照 · 拆股已調整 · 行情 ${new Date(asOf * 1000).toLocaleString()} · 快照 ${new Date(generatedAt * 1000).toLocaleString()}${age > 7200 ? ' · 快照超過 2 小時，非即時' : ' · 非即時'}`;
  }
  async getBars(symbol: string, timeframe: Timeframe, range?: MarketRange, signal?: AbortSignal) {
    if (!this.supportedTimeframes.includes(timeframe as typeof this.supportedTimeframes[number])) throw new Error('Snapshot does not support this timeframe');
    const normalizedRange = normalizeMarketRange(range);
    const data = await this.load(symbol, signal);
    const result = data.results[timeframe];
    if (!result) throw new MarketDataUnavailableError(`${symbol} ${timeframe} 暫無可靠快照資料。`);
    const bars = filterBarsByRange(result.bars, normalizedRange);
    if (!bars.length) throw new Error('No snapshot bars in requested range');
    return { ...result, bars, latestBarAt: bars.at(-1)!.time, source: this.source(data.generatedAt, data.quote.asOf) };
  }
  async getQuote(symbol: string, signal?: AbortSignal) {
    const data = await this.load(symbol, signal);
    return { ...data.quote, source: this.source(data.generatedAt, data.quote.asOf) };
  }
  async getCorporateEvents(symbol: string, range?: MarketRange, signal?: AbortSignal) {
    const normalizedRange = normalizeMarketRange(range);
    const data = await this.load(symbol, signal);
    return { ...data.events, events: data.events.events.filter(e => (normalizedRange?.from === undefined || e.time >= normalizedRange.from) && (normalizedRange?.to === undefined || e.time <= normalizedRange.to)) };
  }
}
