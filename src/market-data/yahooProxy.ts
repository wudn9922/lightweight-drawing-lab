import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeSymbol, timeframes, type Timeframe } from './MarketDataProvider';
import { fetch as proxyFetch, EnvHttpProxyAgent } from 'undici';
import { normalizeYahooEvents, normalizeYahooResponse } from './YahooNormalizer';
import { isYahooTimeframe, yahooIntervals } from './YahooIntervals';
/** Local Vite server only. Unofficial free endpoint; no production availability guarantee. */
export function yahooProxy(): Plugin {
  const dispatcher = new EnvHttpProxyAgent();
  const cache = new Map<string, { at: number; data: unknown }>();
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const requestUrl = req.url;
    const eventsRequest = requestUrl?.startsWith('/api/yahoo/events?') ?? false;
    if (!requestUrl || (!eventsRequest && !requestUrl.startsWith('/api/yahoo?'))) return next();
    let failureStatus = 502;
    try {
      const url = new URL(requestUrl, 'http://localhost');
      failureStatus = 400;
      const symbol = normalizeSymbol(url.searchParams.get('symbol') ?? '');
      const timeframe = eventsRequest ? undefined : (url.searchParams.get('timeframe') as Timeframe);
      if (!eventsRequest && (!timeframe || !timeframes.includes(timeframe) || !isYahooTimeframe(timeframe))) {
        throw new Error('Unsupported timeframe');
      }
      failureStatus = 502;
      const key = eventsRequest ? `${symbol}:events` : `${symbol}:${timeframe}`,
        prior = cache.get(key);
      let data = prior && Date.now() - prior.at < 60000 ? prior.data : null;
      if (!data) {
        const query = eventsRequest
          ? 'interval=1d&range=10y&events=div%2Csplits&includePrePost=false'
          : (() => {
              const mapping = yahooIntervals[timeframe! as keyof typeof yahooIntervals];
              return `interval=${mapping.interval}&range=${mapping.range}&includePrePost=false`;
            })();
        const response = await proxyFetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`,
          {
            dispatcher,
            signal: AbortSignal.timeout(12000),
            headers: { 'User-Agent': 'AtlasTerminal/0.1' },
          },
        );
        if (!response.ok) {
          failureStatus = response.status === 429 ? 429 : response.status >= 500 ? 502 : 422;
          throw new Error('Yahoo returned ' + response.status);
        }
        failureStatus = 422;
        const payload = await response.json();
        const asOf = Date.now() / 1000;
        data = eventsRequest
          ? normalizeYahooEvents(payload, symbol, asOf)
          : normalizeYahooResponse(payload, asOf);
        failureStatus = 502;
        cache.set(key, { at: Date.now(), data });
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    } catch {
      res.statusCode = failureStatus;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Prototype provider unavailable' }));
    }
  };
  return {
    name: 'atlas-yahoo-prototype',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
