import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fetch, EnvHttpProxyAgent } from 'undici';
import { normalizeYahooCalendarResponse, normalizeYahooResponse, normalizeYahooEvents } from '../src/market-data/YahooNormalizer';
import { yahooIntervals } from '../src/market-data/YahooIntervals';
import { normalizeSymbol } from '../src/market-data/MarketDataProvider';
import { snapshotSchema, type MarketSnapshot } from '../src/market-data/SnapshotSchema';

const dispatcher = new EnvHttpProxyAgent();
const symbols: string[] = JSON.parse(await readFile('scripts/market-symbols.json', 'utf8'));
const selected = process.argv.slice(2).length ? process.argv.slice(2).map(normalizeSymbol) : symbols;
if (selected.some(s => !symbols.includes(s))) throw new Error('Requested symbol is not in the public snapshot allowlist');
await mkdir('public/market-data', { recursive: true });
const summary: Record<string, unknown> = {};
let available = 0;
async function atomic(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, JSON.stringify(value));
  await rename(`${path}.tmp`, path);
}
try {
  for (const symbol of selected) {
    let previous: MarketSnapshot | undefined;
    try { previous = snapshotSchema.parse(JSON.parse(await readFile(`public/market-data/${symbol}.json`, 'utf8'))); } catch { /* No prior verified snapshot. */ }
    // Do not mix pre-split cached intervals with newly adjusted intervals. If
    // a refresh fails, retain the entire old snapshot with its old timestamps.
    const results: MarketSnapshot['results'] = {};
    const errors: Record<string, string> = {};
    let dailyRaw: unknown;
    const nativePeriodRaw: Partial<Record<'1W' | '1M', unknown>> = {};
    const configuredIntervals = Object.entries(yahooIntervals);
    const collectionOrder = [...configuredIntervals.filter(([timeframe]) => timeframe !== '1D'), ...configuredIntervals.filter(([timeframe]) => timeframe === '1D')];
    for (const [timeframe, config] of collectionOrder) {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${config.interval}&range=${config.range}&events=div%2Csplits&includePrePost=false`;
        const response = await fetch(url, { dispatcher, signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 AtlasResearchTerminal/1.0' } });
        if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
        const raw: unknown = await response.json();
        if (timeframe === '1W' || timeframe === '1M') {
          nativePeriodRaw[timeframe] = raw;
        } else {
          const result = normalizeYahooResponse(raw, Date.now() / 1000, timeframe as keyof typeof yahooIntervals, symbol);
          results[timeframe as keyof typeof yahooIntervals] = result as MarketSnapshot['results']['1D'];
          if (timeframe === '1D') dailyRaw = raw;
        }
      } catch (error) { errors[timeframe] = error instanceof Error ? error.message : String(error); }
      // Bound request rate. This is background collection, never a UI movement path.
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    for (const timeframe of ['1W', '1M'] as const) {
      const rawNative = nativePeriodRaw[timeframe];
      if (!dailyRaw || !rawNative) {
        delete results[timeframe];
        if (!errors[timeframe]) errors[timeframe] = 'Current period needs freshly validated native and daily data';
        continue;
      }
      try {
        results[timeframe] = normalizeYahooCalendarResponse(rawNative, dailyRaw, Date.now() / 1000, timeframe, symbol) as MarketSnapshot['results']['1D'];
      } catch (error) {
        delete results[timeframe];
        errors[timeframe] = error instanceof Error ? error.message : String(error);
      }
    }
    try {
      if (!dailyRaw) throw new Error('No freshly verified daily quote; preserving last successful snapshot');
      const daily = results['1D'];
      if (!daily?.bars.length) throw new Error('No freshly verified daily bars; preserving last successful snapshot');
      const quote = results['1D']?.quote;
      if (!quote) throw new Error('Yahoo quote metadata unavailable');
      const latestDaily = daily.bars.at(-1)!;
      const utcDate = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
      if (utcDate(latestDaily.time) !== utcDate(quote.asOf) || Math.abs(latestDaily.close - quote.price) > 0.01) {
        throw new Error('Fresh daily bar does not match the validated quote; preserving last successful snapshot');
      }
      const snapshot = snapshotSchema.parse({ version: 3, symbol, generatedAt: Date.now() / 1000, results, quote, events: normalizeYahooEvents(dailyRaw, symbol) });
      await atomic(`public/market-data/${symbol}.json`, snapshot);
      available++;
      summary[symbol] = { status: Object.keys(errors).length ? 'partial' : 'available', generatedAt: snapshot.generatedAt, quoteAsOf: quote.asOf, price: quote.price, timeframes: Object.keys(results), errors };
    } catch (error) {
      if (previous) available++;
      summary[symbol] = { status: previous ? 'retained-stale' : 'unavailable', generatedAt: previous?.generatedAt ?? null, errors, error: String(error) };
    }
    console.log(`${symbol}: ${JSON.stringify(summary[symbol])}`);
  }
  await atomic('public/market-data/manifest.json', { version: 1, attemptedAt: Date.now() / 1000, source: 'Yahoo unofficial prototype. Delayed snapshots, not real-time. OHLC already split-adjusted; no additional split division.', symbols: summary });
  if (!available) throw new Error('No verified market snapshots available; refusing an empty data deployment');
} finally { await dispatcher.close(); }
