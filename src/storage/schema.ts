import { z } from 'zod';
const symbol = z.string().regex(/^[A-Z][A-Z0-9.^-]{0,14}$/);
const finite = z.number().finite();
const tf = z.enum(['5m', '15m', '30m', '1H', '4H', '1D', '1W']);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const tool = z.enum(['trend', 'horizontal', 'ray', 'rectangle', 'fibonacci', 'channel', 'price-range', 'date-range', 'price-date-range', 'vertical']);
export const drawingStyleSchema = z.object({
  color, lineWidth: finite.min(1).max(4),
  lineStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  opacity: finite.min(0).max(1).optional(),
  fillOpacity: finite.min(0).max(0.3).optional(),
  labelsVisible: z.boolean().optional(),
  hiddenLevels: z.array(finite.min(0).max(1)).max(32).optional(),
});
export const anchorSchema = z.object({
  time: finite.min(1).max(32503680000), logical: finite, price: finite, timeframe: tf,
});
export const drawingSchema = z.object({
  id: z.string().min(1).max(100), symbol, type: tool,
  points: z.array(anchorSchema).min(1).max(3),
  levels: z.array(finite.min(0).max(1)).min(2).max(32).optional(),
  locked: z.boolean(), visible: z.boolean(),
  scope: z.object({ timeframes: z.union([z.literal('all'), z.array(tf)]) }),
  style: drawingStyleSchema,
}).refine(d => d.points.length === (d.type === 'horizontal' || d.type === 'vertical' ? 1 : d.type === 'channel' ? 3 : 2), 'Invalid control point count')
  .refine(d => d.type !== 'ray' || d.points[0].price === d.points[1].price, 'Ray must be horizontal')
  .refine(d => d.type === 'fibonacci' ? !!d.levels && new Set(d.levels).size === d.levels.length : !d.levels, 'Invalid Fibonacci levels')
  .refine(d => !d.style.hiddenLevels?.length || d.type === 'fibonacci' && d.style.hiddenLevels.every(l => d.levels?.includes(l)), 'Hidden levels must belong to Fibonacci levels');
export const indicatorSchema = z.object({
  id: z.string().min(1).max(100), symbol, type: z.enum(['SMA', 'EMA', 'Volume']),
  period: z.number().int().min(1).max(5000), source: z.enum(['open', 'high', 'low', 'close']),
  visible: z.boolean(), locked: z.boolean(),
  lineWidth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), color,
  scope: z.object({ timeframe: tf.optional() }),
});
const range = z.object({ from: finite, to: finite, barCount: z.number().int().positive().optional() })
  .refine(v => v.to > v.from && v.to - v.from <= 100000);
export const preferencesSchema = z.object({ timeframe: tf, views: z.record(z.string(), range), magnet: z.boolean(), legacyVolume: z.boolean().optional() });
export const symbolStateSchema = z.object({
  symbol, drawings: z.array(drawingSchema).max(10000), indicators: z.array(indicatorSchema).max(100), preferences: preferencesSchema,
}).superRefine((s, c) => {
  for (const list of [s.drawings, s.indicators]) {
    const ids = new Set<string>();
    for (const item of list) {
      if (item.symbol !== s.symbol || ids.has(item.id)) c.addIssue({ code: 'custom', message: 'Symbol mismatch or duplicate id' });
      ids.add(item.id);
    }
  }
});
export const alertSchema = z.object({
  id: z.string().min(1).max(100), symbol, timeframe: tf,
  kind: z.enum(['level', 'ma', 'drawing']), direction: z.enum(['above', 'below', 'cross']),
  level: finite.optional(), maType: z.enum(['SMA', 'EMA']).optional(), period: z.number().int().min(1).max(5000).optional(), drawingId: z.string().min(1).max(100).optional(),
  enabled: z.boolean(), invalidReason: z.string().max(300).nullable().default(null),
  lastTriggered: finite.nullable().default(null), lastEvaluated: finite.nullable().default(null),
  baseline: finite.nullable().default(null), referencePrice: finite.nullable().default(null),
}).refine(a => a.kind === 'level' ? a.level !== undefined : a.kind === 'ma' ? !!a.maType && !!a.period : !!a.drawingId, 'Missing alert condition');
export type AlertDefinition = z.infer<typeof alertSchema>;
const presetSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().trim().min(1).max(80),
  indicators: z.array(indicatorSchema.omit({ id: true, symbol: true })).max(100),
});
export const appSchema = z.object({
  watchlist: z.array(symbol).max(1000), activeSymbol: symbol, provider: z.enum(['demo', 'yahoo']),
  recentSymbols: z.array(symbol).max(20).default([]),
  drawingDefaults: z.partialRecord(tool, drawingStyleSchema).default({}),
  indicatorPresets: z.array(presetSchema).max(100).default([]),
  alerts: z.array(alertSchema).max(1000).default([]),
  workspace: z.object({
    rightOpen: z.boolean().default(true), rightTab: z.enum(['indicators', 'drawings', 'financials', 'backtest', 'alerts', 'settings']).default('indicators'), debug: z.boolean().default(false),
  }).default({ rightOpen: true, rightTab: 'indicators', debug: false }),
}).superRefine((a,c) => {
  if (new Set(a.watchlist).size !== a.watchlist.length) c.addIssue({code:'custom',message:'Duplicate watchlist symbol'});
  for (const list of [a.alerts,a.indicatorPresets]) if (new Set(list.map(x=>x.id)).size !== list.length) c.addIssue({code:'custom',message:'Duplicate workspace id'});
});
const envelope = { exportedAt: z.string(), app: appSchema, symbols: z.array(symbolStateSchema).max(1000) };
export const exportSchema = z.object({ version: z.literal(2), ...envelope })
  .superRefine((d,c) => {
    if (new Set(d.symbols.map(s => s.symbol)).size !== d.symbols.length) c.addIssue({code:'custom',message:'Duplicate symbol state'});
    for(const a of d.app.alerts) if(a.kind==='drawing' && a.enabled && !d.symbols.some(s=>s.symbol===a.symbol && s.drawings.some(x=>x.id===a.drawingId && (x.type==='horizontal'||x.type==='ray')))) c.addIssue({code:'custom',message:'Orphan drawing alert'});
  });
// Legacy envelopes are parsed by the same validated domain model, then upgraded.
const legacyExportSchema = z.object({ version: z.literal(1), ...envelope });
export type SymbolState = z.infer<typeof symbolStateSchema>;
export type AppSettings = z.infer<typeof appSchema>;
export type SettingsExport = z.infer<typeof exportSchema>;
export function emptySymbol(symbol: string): SymbolState {
  return { symbol, drawings: [], indicators: [], preferences: { timeframe: '1D', views: {}, magnet: false } };
}
export function parseSettings(json: string): SettingsExport {
  if (json.length > 10_000_000) throw new Error('Import exceeds 10 MB');
  const data: unknown = JSON.parse(json);
  const version = z.object({version:z.number()}).parse(data).version;
  return exportSchema.parse(version === 1 ? { ...legacyExportSchema.parse(data), version: 2 } : data);
}
