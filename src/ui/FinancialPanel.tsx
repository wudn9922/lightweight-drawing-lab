import { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { reportError } from '../errors/UserErrors';
import { SecEdgarProvider } from '../fundamentals/SecEdgarProvider';
import { financialGrowth, margins } from '../fundamentals/FinancialCalculations';
import type {
  CompanyFundamentals,
  FinancialMetric,
  FinancialPeriod,
  FundamentalsProvider,
} from '../fundamentals/FundamentalsProvider';
import { STATIC_HOSTING } from '../app/HostingMode';
const sec = new SecEdgarProvider();
const labels: Record<FinancialMetric, string> = {
  revenue: 'Revenue',
  costOfRevenue: 'Cost of Revenue',
  grossProfit: 'Gross Profit',
  operatingExpenses: 'Operating Expenses',
  operatingIncome: 'Operating Income',
  netIncome: 'Net Income',
  epsBasic: 'EPS Basic',
  epsDiluted: 'EPS Diluted',
  operatingCashFlow: 'Operating Cash Flow',
  capex: 'CapEx',
  freeCashFlow: 'Free Cash Flow',
  cash: 'Cash',
  totalAssets: 'Total Assets',
  totalLiabilities: 'Total Liabilities',
  equity: 'Equity',
};
const tabs = ['Overview', 'Income Statement', 'Cash Flow', 'Balance Sheet'] as const;
type Tab = (typeof tabs)[number];
const groups: Record<Tab, FinancialMetric[]> = {
  Overview: ['revenue', 'epsDiluted', 'netIncome', 'freeCashFlow'],
  'Income Statement': [
    'revenue',
    'costOfRevenue',
    'grossProfit',
    'operatingExpenses',
    'operatingIncome',
    'netIncome',
    'epsBasic',
    'epsDiluted',
  ],
  'Cash Flow': ['operatingCashFlow', 'capex', 'freeCashFlow'],
  'Balance Sheet': ['cash', 'totalAssets', 'totalLiabilities', 'equity'],
};
const periodLabel = (r: CompanyFundamentals) =>
  `FY${r.fiscalYear}${r.fiscalQuarter ? ` Q${r.fiscalQuarter}` : ''}`;
export function formatFinancial(value: number | null, metric: FinancialMetric) {
  if (value === null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...(metric.startsWith('eps')
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { notation: 'compact', maximumFractionDigits: 2 }),
  }).format(value);
}
const percent = (value: number | null) =>
  value === null ? 'N/A' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
function HistoryChart({
  records,
  metric,
}: {
  records: CompanyFundamentals[];
  metric: FinancialMetric;
}) {
  const recent = records.slice(-12),
    values = recent.flatMap((r) => (r[metric] === null ? [] : [r[metric]!]));
  if (!values.length) return <div className="financial-chart-empty">歷史資料 N/A</div>;
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values),
    span = max - min || 1;
  const y = (value: number) => 10 + ((max - value) / span) * 52,
    zero = y(0),
    step = 224 / Math.max(1, recent.length);
  return (
    <svg
      className="financial-history"
      viewBox="0 0 240 86"
      role="img"
      aria-label={`${labels[metric]} history`}
    >
      <title>
        {labels[metric]} —{' '}
        {recent.map((r) => `${periodLabel(r)}: ${formatFinancial(r[metric], metric)}`).join(', ')}
      </title>
      <line x1="8" x2="232" y1={zero} y2={zero} stroke="#3b4a60" />
      {recent.map((r, i) =>
        r[metric] === null ? null : (
          <rect
            key={r.periodEnd}
            x={8 + i * step + step * 0.18}
            y={Math.min(y(r[metric]!), zero)}
            width={step * 0.64}
            height={Math.max(1, Math.abs(y(r[metric]!) - zero))}
            rx="2"
            fill={r[metric]! < 0 ? '#c78383' : '#699ccd'}
          >
            <title>
              {periodLabel(r)}: {formatFinancial(r[metric], metric)}
            </title>
          </rect>
        ),
      )}
      <text x="8" y="80" fill="#8294ac" fontSize="9">
        {periodLabel(recent[0])}
      </text>
      <text x="232" y="80" fill="#8294ac" fontSize="9" textAnchor="end">
        {periodLabel(recent.at(-1)!)}
      </text>
    </svg>
  );
}
function Audit({ record, metric }: { record: CompanyFundamentals; metric: FinancialMetric }) {
  const source = record.sourceConcepts[metric];
  return (
    <details className="financial-audit">
      <summary aria-label={`Audit ${labels[metric]}`}>
        <span>
          {labels[metric]}
          <small>{source ? (source.derived ? 'DERIVED' : 'RAW') : 'MISSING'}</small>
        </span>
        <b data-testid={`financial-${metric}`}>{formatFinancial(record[metric], metric)}</b>
      </summary>
      <div className="financial-audit-body">
        <p>
          {periodLabel(record)} · {record.periodStart} → {record.periodEnd}
        </p>
        {!source ? (
          <p>此期間暫無可用的相容資料。</p>
        ) : (
          <>
            <strong>{source.derived ? 'Derived calculation' : 'Raw filing fact'}</strong>
            {source.calculation && <p className="audit-calculation">{source.calculation}</p>}
            {source.inputs.map((input, i) => (
              <div
                className="audit-source"
                key={`${input.concept}-${input.accession}-${input.end}-${i}`}
              >
                <dl>
                  <dt>XBRL concept</dt>
                  <dd>{input.concept}</dd>
                  <dt>Raw input / unit</dt>
                  <dd>
                    {input.value.toLocaleString('en-US', { maximumFractionDigits: 6 })} {input.unit}
                  </dd>
                  <dt>Fact period / kind</dt>
                  <dd>
                    {input.start ? `${input.start} → ` : ''}
                    {input.end} · {input.kind}
                  </dd>
                  <dt>Form / filing date</dt>
                  <dd>
                    {input.form} · {input.filed}
                  </dd>
                  <dt>Accession</dt>
                  <dd>{input.accession}</dd>
                  <dt>Filing focus</dt>
                  <dd>
                    FY{input.fiscalYearFocus} {input.fiscalPeriodFocus}（可含比較期間）
                  </dd>
                </dl>
                <a href={input.filingUrl} target="_blank" rel="noreferrer">
                  SEC filing <ExternalLink size={12} />
                </a>
                <a href={input.secUrl} target="_blank" rel="noreferrer">
                  SEC companyfacts <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
export function FinancialPanel({
  symbol,
  simulatedMarket,
  provider = sec,
  onRecords,
}: {
  symbol: string;
  simulatedMarket: boolean;
  provider?: FundamentalsProvider;
  onRecords?: (records: CompanyFundamentals[]) => void;
}) {
  const [period, setPeriod] = useState<FinancialPeriod>('quarterly'),
    [tab, setTab] = useState<Tab>('Overview'),
    [selectedEnd, setSelectedEnd] = useState(''),
    [retry, setRetry] = useState(0);
  const key = `${symbol}:${period}:${retry}`;
  const [data, setData] = useState<{
    key: string;
    records: CompanyFundamentals[];
    error: string;
    loading: boolean;
  }>({ key: '', records: [], error: '', loading: true });
  useEffect(() => {
    if (STATIC_HOSTING) return;
    const controller = new AbortController();
    let active = true;
    setData({ key, records: [], error: '', loading: true });
    void provider
      .getFinancials(symbol, period, controller.signal)
      .then((records) => {
        if (active) { setData({ key, records, error: '', loading: false }); onRecords?.(records); }
      })
      .catch((error) => {
        if(active) reportError('sec',error);
        if (active)
          setData({ key, records: [], error: 'SEC 資料來源暫時無法使用。', loading: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [symbol, period, provider, key, onRecords]);
  if (STATIC_HOSTING) {
    return (
      <section
        className="financial-panel"
        data-testid="financial-panel"
        aria-label={`${symbol} financials`}
      >
        <div className="section-heading">
          <span>SEC EDGAR</span>
          <span>需要 backend</span>
        </div>
        <div className="financial-state" role="status">
          <strong>SEC 財報需要 backend</strong>
          <p>GitHub Pages 靜態網站目前沒有 fundamentals backend，財報暫不可用。</p>
        </div>
      </section>
    );
  }
  const loading = data.key !== key || data.loading,
    records = data.key === key ? data.records : [],
    record = records.find((r) => r.periodEnd === selectedEnd) ?? records.at(-1);
  return (
    <section
      className="financial-panel"
      data-testid="financial-panel"
      aria-label={`${symbol} financials`}
    >
      <div className="section-heading">
        <span>SEC EDGAR</span>
        <span>USD · ACTUAL</span>
      </div>
      {simulatedMarket && (
        <p className="financial-provenance-note">
          財報為 SEC 實際申報資料；圖表價格仍是 DEMO 模擬。
        </p>
      )}
      <div className="financial-period-toggle" role="group" aria-label="Financial frequency">
        <button aria-pressed={period === 'quarterly'} onClick={() => setPeriod('quarterly')}>
          Quarterly
        </button>
        <button aria-pressed={period === 'annual'} onClick={() => setPeriod('annual')}>
          Annual
        </button>
      </div>
      {loading ? (
        <p role="status" className="financial-state">
          讀取 {symbol} SEC 財報…
        </p>
      ) : data.error ? (
        <div className="financial-state" role="alert">
          <p>{data.error} K 線與 drawing 可繼續使用。</p>
          <button className="financial-retry" onClick={() => setRetry((n) => n + 1)}>
            <RefreshCw size={15} />
            重新載入財報
          </button>
        </div>
      ) : !record ? (
        <p className="financial-state">此資料來源暫無可用財報</p>
      ) : (
        <>
          <p className="financial-filing">{record.issuerName ?? symbol} · SEC CIK {record.cik ?? 'see audit source'}</p>
          <label className="financial-period-label">
            Fiscal period
            <select
              aria-label="Fiscal period"
              value={record.periodEnd}
              onChange={(e) => setSelectedEnd(e.target.value)}
            >
              {[...records].reverse().map((r) => (
                <option key={r.periodEnd} value={r.periodEnd}>
                  {periodLabel(r)} · {r.periodEnd}
                </option>
              ))}
            </select>
          </label>
          <p className="financial-filing">SEC Filing（非 earnings timestamp）<br/>
            {record.periodStart} → {record.periodEnd}
            <br />
            {record.form} · filed {record.filingDate}
          </p>
          <nav className="financial-tabs" aria-label="Financial statements">
            {tabs.map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <div className={tab === 'Overview' ? 'financial-overview' : 'financial-statement'}>
            {groups[tab].map((metric) => {
              const change = financialGrowth(records, record, metric);
              return (
                <div className="financial-metric" key={metric}>
                  <Audit record={record} metric={metric} />
                  {tab === 'Overview' && (
                    <>
                      <div className="financial-growth">
                        <span>
                          YoY <b>{percent(change.yoy)}</b>
                        </span>
                        {period === 'quarterly' && (
                          <span>
                            QoQ <b>{percent(change.qoq)}</b>
                          </span>
                        )}
                      </div>
                      <HistoryChart
                        records={records.filter((r) => r.periodEnd <= record.periodEnd)}
                        metric={metric}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {tab === 'Overview' && (
            <div className="financial-margins">
              {Object.entries(margins(record)).map(([name, value]) => (
                <div key={name}>
                  <span>
                    {name === 'gross' ? 'Gross' : name === 'operating' ? 'Operating' : 'Net'} Margin
                  </span>
                  <b>{value === null ? 'N/A' : `${value.toFixed(1)}%`}</b>
                </div>
              ))}
            </div>
          )}
          {!!record.warnings.length && (
            <div className="financial-warnings" role="status">
              {record.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          <p className="financial-footnote">
            點選數值查看 SEC 來源與推導。YoY／QoQ 依 fiscal period 對齊；成長率以 |前期值|
            為分母。缺資料與 0 分母為 N/A。季度 EPS 僅採 standalone 申報值。
          </p>
        </>
      )}
    </section>
  );
}
