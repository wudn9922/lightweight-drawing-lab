import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('rejects Yahoo bars, quotes, events, and SEC financials before network access on static hosting', async () => {
  vi.stubEnv('VITE_STATIC_HOSTING', '1');
  vi.resetModules();
  const [{ YahooProvider }, { SecEdgarProvider }, { MarketDataUnavailableError }] =
    await Promise.all([
      import('../src/market-data/YahooProvider'),
      import('../src/fundamentals/SecEdgarProvider'),
      import('../src/market-data/ProviderErrors'),
    ]);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const yahoo = new YahooProvider();
  const sec = new SecEdgarProvider();

  for (const request of [
    yahoo.getBars('AAPL', '1D'),
    yahoo.getQuote('AAPL'),
    yahoo.getCorporateEvents('AAPL'),
  ]) {
    const error = await request.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MarketDataUnavailableError);
    expect(error).toMatchObject({ message: expect.stringContaining('需要 backend') });
  }
  await expect(sec.getFinancials('AAPL', 'quarterly')).rejects.toThrow(
    'fundamentals backend',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
