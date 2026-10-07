import { IndexedDBStore, defaultApp } from '../storage/IndexedDBStore';
import { appSchema, symbolStateSchema, emptySymbol, parseSettings, type SymbolState, type AppSettings } from '../storage/schema';
import { reconcileDrawingAlerts } from '../alerts/AlertEngine';
import { drawingSchema, alertSchema, type AlertDefinition } from '../storage/schema';
import type { Drawing } from '../drawing/DrawingModel';
import { DrawingHistory } from '../drawing/DrawingHistory';
import type { IndicatorInstance } from '../indicators/IndicatorRegistry';
export interface AppSnapshot {
  ready: boolean;
  app: AppSettings;
  symbols: Record<string, SymbolState>;
  storageError: string | null;
  saving: boolean;
  revision: number;
}
export class AppStore {
  private snapshot: AppSnapshot = {
    ready: false,
    app: structuredClone(defaultApp),
    symbols: {},
    storageError: null,
    saving: false,
    revision: 0,
  };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private histories = new Map<string, DrawingHistory>();
  private pendingSaves = 0;
  private failures = new Map<string, string>();
  constructor(readonly storage = new IndexedDBStore()) {}
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(next: Partial<AppSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next, revision: this.snapshot.revision + 1 };
    this.listeners.forEach((cb) => cb());
  }
  async initialize() {
    try {
      const data = await this.storage.load();
      this.publish({
        ready: true,
        app: data.app,
        symbols: Object.fromEntries(data.symbols.map((s) => [s.symbol, s])),
      });
    } catch (e) {
      this.publish({ ready: true, storageError: String(e) });
    }
  }
  symbol(symbol = this.snapshot.app.activeSymbol) {
    return this.snapshot.symbols[symbol] ?? emptySymbol(symbol);
  }
  history(symbol = this.snapshot.app.activeSymbol) {
    let h = this.histories.get(symbol);
    if (!h) {
      h = new DrawingHistory();
      this.histories.set(symbol, h);
    }
    return h;
  }
  private persist(key: string, task: () => Promise<void>) {
    this.pendingSaves++;
    this.publish({ saving: true });
    this.queue = this.queue.then(async () => {
      try {
        await task();
        this.failures.delete(key);
      } catch (e) {
        this.failures.set(key, '儲存失敗：' + String(e));
      } finally {
        this.pendingSaves--;
        this.publish({
          saving: this.pendingSaves > 0,
          storageError: this.failures.size ? [...this.failures.values()].join('; ') : null,
        });
      }
    });
  }

  updateSymbol(symbol: string, fn: (s: SymbolState) => SymbolState) {
    const next = symbolStateSchema.parse(fn(this.symbol(symbol)));
    this.publish({ symbols: { ...this.snapshot.symbols, [symbol]: next } });
    this.persist('symbol:' + symbol, () => this.storage.saveSymbol(next));
  }
  updateApp(patch: Partial<AppSettings>) {
    const next = appSchema.parse({ ...this.snapshot.app, ...patch });
    this.publish({ app: next });
    this.persist('app', () => this.storage.saveApp(next));
  }
  commitDrawings(symbol: string, drawings: Drawing[], label: string) {
    const before = this.symbol(symbol).drawings;
    if (label === 'move' || label.startsWith('edit P')) {
      const locked = new Map(before.filter((d) => d.locked).map((d) => [d.id, d]));
      drawings = drawings.map((d) => locked.get(d.id) ?? d);
    }
    drawings.forEach(d => drawingSchema.parse(d));
    const after = this.history(symbol).execute({ before, after: drawings, label });
    this.updateSymbol(symbol, (s) => ({ ...s, drawings: after }));
    this.reconcileAlerts(symbol, after);
  }
  undo() {
    const symbol = this.snapshot.app.activeSymbol,
      result = this.history(symbol).undo();
    if (result) {
      this.updateSymbol(symbol, (s) => ({ ...s, drawings: result }));
      this.reconcileAlerts(symbol, result);
    }
  }
  redo() {
    const symbol = this.snapshot.app.activeSymbol,
      result = this.history(symbol).redo();
    if (result) {
      this.updateSymbol(symbol, (s) => ({ ...s, drawings: result }));
      this.reconcileAlerts(symbol, result);
    }
  }
  mutateDrawing(id: string, action: 'lock' | 'delete') {
    const s = this.symbol(),
      d = s.drawings.find((x) => x.id === id);
    if (!d || (action === 'delete' && d.locked)) return;
    const next =
      action === 'delete'
        ? s.drawings.filter((x) => x.id !== id)
        : s.drawings.map((x) => (x.id === id ? { ...x, locked: !x.locked } : x));
    this.commitDrawings(
      s.symbol,
      next,
      action === 'delete' ? 'delete' : d.locked ? 'unlock' : 'lock',
    );
  }
  private reconcileAlerts(symbol: string, drawings: Drawing[]) {
    const alerts = reconcileDrawingAlerts(this.snapshot.app.alerts, symbol, drawings);
    if (JSON.stringify(alerts) !== JSON.stringify(this.snapshot.app.alerts)) this.updateApp({ alerts });
  }
  updateDrawing(id: string, patch: Partial<Pick<Drawing, 'style' | 'levels' | 'visible'>>) {
    const s = this.symbol(), d = s.drawings.find(x => x.id === id);
    if (!d) return;
    const next = d.locked ? { ...d, visible: patch.visible ?? d.visible } : { ...d, ...patch };
    drawingSchema.parse(next);
    this.commitDrawings(s.symbol, s.drawings.map(x => x.id === id ? next : x), 'settings');
  }
  saveIndicatorPreset(name: string, symbol: string) {
    const id = crypto.randomUUID();
    const indicators = this.symbol(symbol).indicators.map(({ id: _id, symbol: _symbol, ...i }) => structuredClone(i));
    const preset = { id, name: name.trim(), indicators };
    const next = { ...this.snapshot.app, indicatorPresets: [...this.snapshot.app.indicatorPresets, preset] };
    // Validate before publication, including an empty preset name.
    this.updateApp(next);
    return id;
  }
  applyIndicatorPreset(id: string, symbol: string) {
    const preset = this.snapshot.app.indicatorPresets.find(p => p.id === id);
    if (!preset) return;
    const instances = preset.indicators.map(i => ({ ...structuredClone(i), id: crypto.randomUUID(), symbol }));
    this.updateSymbol(symbol, s => ({ ...s, indicators: [...s.indicators, ...instances], preferences: instances.some(i=>i.type==='Volume') ? {...s.preferences,legacyVolume:false} : s.preferences }));
  }
  addAlert(definition: AlertDefinition) {
    const alert = alertSchema.parse(definition);
    if (alert.kind === 'drawing' && !this.symbol(alert.symbol).drawings.some(d => d.id === alert.drawingId && (d.type === 'horizontal' || d.type === 'ray'))) throw new Error('Drawing alert reference unavailable');
    this.updateApp({ alerts: [...this.snapshot.app.alerts, alert] });
  }
  updateAlerts(alerts: AlertDefinition[]) {
    let safe = alerts;
    for (const symbol of new Set(alerts.filter(a=>a.kind==='drawing').map(a=>a.symbol))) safe = reconcileDrawingAlerts(safe, symbol, this.symbol(symbol).drawings);
    this.updateApp({ alerts: safe });
  }
  addIndicator(instance: IndicatorInstance) {
    this.updateSymbol(instance.symbol, (s) => ({ ...s, indicators: [...s.indicators, instance], preferences: instance.type === 'Volume' ? {...s.preferences,legacyVolume:false} : s.preferences }));
  }
  updateIndicator(symbol: string, id: string, patch: Partial<IndicatorInstance>) {
    this.updateSymbol(symbol, (s) => ({
      ...s,
      indicators: s.indicators.map((i) =>
        i.id !== id
          ? i
          : i.locked
            ? { ...i, locked: patch.locked ?? i.locked, visible: patch.visible ?? i.visible }
            : { ...i, ...patch, id: i.id, symbol: i.symbol },
      ),
    }));
  }
  removeIndicator(symbol: string, id: string) {
    const removedVolume = this.symbol(symbol).indicators.some(i=>i.id===id && i.type==='Volume' && !i.locked);
    this.updateSymbol(symbol, (s) => ({
      ...s,
      indicators: s.indicators.filter((i) => i.id !== id || i.locked),
      preferences: removedVolume ? {...s.preferences,legacyVolume:false} : s.preferences,
    }));
  }
  async flush() {
    await this.queue;
  }
  async export() {
    await this.flush();
    if (this.snapshot.storageError) throw new Error(this.snapshot.storageError);
    return this.storage.export();
  }
  async import(json: string) {
    const parsed = parseSettings(json);
    await this.flush();
    await this.storage.import(parsed);
    this.histories.clear();
    this.failures.clear();
    this.publish({
      app: parsed.app,
      symbols: Object.fromEntries(parsed.symbols.map((s) => [s.symbol, s])),
      storageError: null,
    });
  }
}
