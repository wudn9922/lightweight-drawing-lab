import { financialSchema } from './financialSchema';
import type {
  CompanyFundamentals,
  FinancialPeriod,
  FundamentalsProvider,
} from './FundamentalsProvider';
import { normalizeSymbol } from '../market-data/MarketDataProvider';
import { STATIC_HOSTING } from '../app/HostingMode';

const STATIC_BACKEND_REQUIRED =
  'SEC 財報需要 backend；此 GitHub Pages 靜態部署沒有 fundamentals backend。';

/** Browser provider sees normalized records only. SEC raw XBRL stays in the backend. */
export class SecEdgarProvider implements FundamentalsProvider {
  readonly id = 'sec-edgar';
  private cache = new Map<string, { at: number; records: CompanyFundamentals[] }>();
  async getFinancials(
    symbol: string,
    period: FinancialPeriod,
    signal?: AbortSignal,
  ): Promise<CompanyFundamentals[]> {
    if (STATIC_HOSTING) throw new Error(STATIC_BACKEND_REQUIRED);
    symbol = normalizeSymbol(symbol);
    const key = symbol + ':' + period,
      cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 3600000) return structuredClone(cached.records);
    const response = await fetch(
      `/api/fundamentals?symbol=${encodeURIComponent(symbol)}&period=${period}`,
      { signal },
    );
    if (!response.ok) throw new Error('SEC 資料來源暫時無法使用，請稍後再試。');
    const records = financialSchema.array().parse(await response.json());
    if (records.some((r) => r.symbol !== symbol || r.period !== period))
      throw new Error('Financial provider returned mismatched records');
    this.cache.delete(key);
    this.cache.set(key, { at: Date.now(), records });
    while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    return structuredClone(records);
  }
}
