import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { it, expect, vi } from 'vitest';
import { IndexedDBStore } from '../src/storage/IndexedDBStore';
import { AppStore } from '../src/app/AppStore';
import { appSchema, emptySymbol, parseSettings, alertSchema, legacyVolumeEnabled } from '../src/storage/schema';
const ma = (symbol: string, period: number) => ({
  id: crypto.randomUUID(),
  symbol,
  type: 'SMA' as const,
  period,
  source: 'close' as const,
  visible: true,
  locked: true,
  color: '#123456',
  lineWidth: 2 as const,
  scope: {},
});
it('migrates actual database v1 without losing symbol indicators/locks/order and upgrades legacy backups', async () => {
  const name = 'legacy-' + crypto.randomUUID();
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('symbols', { keyPath: 'symbol' });
      db.createObjectStore('app');
    },
  });
  const app = { watchlist: ['NVDA', 'AAPL'], activeSymbol: 'NVDA', provider: 'demo' };
  const symbols = [
    { ...emptySymbol('AAPL'), indicators: [ma('AAPL', 24), ma('AAPL', 58)] },
    { ...emptySymbol('NVDA'), indicators: [ma('NVDA', 43), ma('NVDA', 56)] },
  ];
  await old.put('app', app, 'settings');
  for (const s of symbols) await old.put('symbols', s);
  old.close();
  const db = new IndexedDBStore(name),
    store = new AppStore(db);
  await store.initialize();
  expect(store.getSnapshot().storageError).toBeNull();
  expect(store.getSnapshot().app.watchlist).toEqual(['NVDA', 'AAPL']);
  expect(store.symbol('AAPL').indicators.map((i) => i.period)).toEqual([24, 58]);
  expect(store.symbol('NVDA').indicators.map((i) => i.period)).toEqual([43, 56]);
  expect(store.symbol('NVDA').indicators.every((i) => i.locked)).toBe(true);
  const backup = await store.export();
  expect(backup.version).toBe(3);
  expect(backup.app.alerts).toEqual([]);
  expect(
    parseSettings(JSON.stringify({ version: 1, exportedAt: 'legacy', app, symbols })).symbols,
  ).toEqual(symbols.map(s => ({
    ...s,
    indicators: s.indicators.map(i => ({ ...i, scope: { timeframe: '1D' } })),
    preferences: {
      ...s.preferences,
      ownershipMigration: { fromVersion: 1, indicatorHome: '1D', drawingRule: 'first-anchor' },
    },
  })));
  await db.close();
  const reopened = await openDB(name);
  expect(reopened.version).toBe(3);
  reopened.close();
});

it('migrates v2 timeframe ownership and imports legacy v1/v2 backups as v3 without losing drawing state', async () => {
  const name = 'legacy-v2-' + crypto.randomUUID();
  const globalLine = {
    id: 'global-line', symbol: 'AAPL', type: 'horizontal' as const,
    points: [{ time: 1_700_000_000, logical: 1, price: 10, timeframe: '1D' as const }],
    locked: true, visible: true, scope: { timeframes: 'all' as const },
    style: { color: '#123456', lineWidth: 2 },
  };
  const multiLine = {
    ...globalLine, id: 'multi-line', locked: false,
    scope: { timeframes: ['1D', '1W'] as ('1D' | '1W')[] },
  };
  const singleLine = {
    ...globalLine, id: 'single-line',
    scope: { timeframes: ['1W'] as '1W'[] },
  };
  const explicitIndicator = { ...ma('AAPL', 26), scope: { timeframe: '5m' as const } };
  const symbols = [{
    ...emptySymbol('AAPL'),
    drawings: [globalLine, multiLine, singleLine],
    indicators: [ma('AAPL', 13), explicitIndicator],
    preferences: { timeframe: '1W' as const, views: {}, magnet: true, legacyVolume: false },
  }];
  const app = {
    watchlist: ['AAPL'], activeSymbol: 'AAPL', provider: 'demo',
    alerts: [
      alertSchema.parse({ id: 'mismatch', symbol: 'AAPL', timeframe: '1W', kind: 'drawing', drawingId: 'global-line', direction: 'cross', enabled: true }),
      alertSchema.parse({ id: 'match', symbol: 'AAPL', timeframe: '1W', kind: 'drawing', drawingId: 'single-line', direction: 'cross', enabled: true }),
    ],
  };
  const legacyV2 = { version: 2, exportedAt: 'legacy-v2', app, symbols };
  const old = await openDB(name, 2, {
    upgrade(db) {
      db.createObjectStore('symbols', { keyPath: 'symbol' });
      db.createObjectStore('app');
    },
  });
  await old.put('app', app, 'settings');
  await old.put('symbols', symbols[0]);
  old.close();

  const db = new IndexedDBStore(name), store = new AppStore(db);
  await store.initialize();
  const migrated = store.symbol('AAPL');
  expect(migrated.indicators.map(i => i.scope.timeframe)).toEqual(['1W', '5m']);
  expect(migrated.drawings).toEqual([
    { ...globalLine, scope: { timeframes: ['1D'] } },
    { ...multiLine, scope: { timeframes: ['1D'] } },
    singleLine,
  ]);
  expect(migrated.drawings[0]).toMatchObject({ id: 'global-line', locked: true, style: globalLine.style, points: globalLine.points });
  expect(migrated.preferences.volumeOverrides).toEqual({
    '5m': false, '15m': false, '30m': false, '1H': false, '4H': false, '1D': false, '1W': false, '1M': false,
  });
  expect(legacyVolumeEnabled(migrated.preferences, '1M')).toBe(false);
  expect(store.getSnapshot().app.alerts).toMatchObject([
    { id: 'mismatch', enabled: false, invalidReason: 'Referenced drawing is scoped to another timeframe' },
    { id: 'match', enabled: true },
  ]);
  const exported = await store.export();
  expect(exported.version).toBe(3);
  expect(exported.symbols[0].drawings).toHaveLength(3);

  for (const version of [1, 2] as const) {
    const parsed = parseSettings(JSON.stringify({ ...legacyV2, version }));
    expect(parsed.version).toBe(3);
    expect(parsed.symbols[0].indicators[0].scope.timeframe).toBe('1W');
    expect(parsed.symbols[0].drawings.map(d => d.scope.timeframes)).toEqual([['1D'], ['1D'], ['1W']]);
  }
  const target = new AppStore(new IndexedDBStore('legacy-import-' + crypto.randomUUID()));
  await target.initialize();
  await target.import(JSON.stringify(legacyV2));
  expect((await target.export()).symbols[0].drawings).toEqual(exported.symbols[0].drawings);
  await target.storage.close();
  await db.close();
});

it('AppStore converts legacy global drawings to singleton v3 ownership before persisting', async () => {
  const db = new IndexedDBStore('normalize-drawings-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  const line = {
    id: 'manual-global', symbol: 'AAPL', type: 'horizontal' as const,
    points: [{ time: 1_700_000_000, logical: 10, price: 10, timeframe: '1W' as const }],
    locked: false, visible: true, scope: { timeframes: 'all' as const },
    style: { color: '#123456', lineWidth: 2 },
  };
  store.commitDrawings('AAPL', [line], 'create');
  expect(store.symbol('AAPL').drawings[0].scope.timeframes).toEqual(['1D']);
  await store.flush();
  expect((await store.export()).symbols[0].drawings[0].scope.timeframes).toEqual(['1D']);
  await db.close();
});
it('presets contain only the current timeframe and rebind fresh instances to each target timeframe', async () => {
  const db = new IndexedDBStore('preset-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  store.addIndicator(ma('AAPL', 24));
  store.updateSymbol('AAPL', s => ({ ...s, preferences: { ...s.preferences, timeframe: '1W' } }));
  store.addIndicator(ma('AAPL', 43));
  store.updateSymbol('AAPL', s => ({ ...s, preferences: { ...s.preferences, timeframe: '1D' } }));
  const id = store.saveIndicatorPreset('Structure', 'AAPL');
  expect(store.getSnapshot().app.indicatorPresets[0].indicators.map(i => i.period)).toEqual([24]);
  store.updateSymbol('NVDA', s => ({ ...s, preferences: { ...s.preferences, timeframe: '1M' } }));
  store.applyIndicatorPreset(id, 'NVDA');
  store.applyIndicatorPreset(id, 'AMD');
  const nv = store.symbol('NVDA').indicators[0],
    amd = store.symbol('AMD').indicators[0];
  expect(nv.id).not.toBe(amd.id);
  expect(nv.scope.timeframe).toBe('1M');
  expect(amd.scope.timeframe).toBe('1D');
  store.updateIndicator('NVDA', nv.id, { locked: false });
  store.updateIndicator('NVDA', nv.id, { period: 43 });
  expect(store.symbol('AMD').indicators[0].period).toBe(24);
  expect(store.symbol('AAPL').indicators[0].period).toBe(24);
  expect(store.getSnapshot().app.indicatorPresets[0].indicators[0].period).toBe(24);
  await store.flush();
  await db.close();
});
it('V1 backups include workspace/defaults/presets/alerts; invalid import is atomic', async () => {
  const db = new IndexedDBStore('backup-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  store.updateApp({
    drawingDefaults: { trend: { color: '#123456', lineWidth: 3, opacity: 0.5 } },
    workspace: { rightOpen: true, rightTab: 'alerts', debug: true },
  });
  store.addAlert(
    alertSchema.parse({
      id: 'a',
      symbol: 'AAPL',
      timeframe: '15m',
      kind: 'level',
      level: 100,
      direction: 'cross',
      enabled: true,
    }),
  );
  const backup = await store.export();
  await store.import(JSON.stringify(backup));
  expect(store.getSnapshot().app).toEqual(backup.app);
  const invalid = {
    ...backup,
    app: {
      ...backup.app,
      alerts: [{ ...backup.app.alerts[0], kind: 'drawing', drawingId: 'missing' }],
    },
  };
  await expect(store.import(JSON.stringify(invalid))).rejects.toThrow('Orphan');
  expect(store.getSnapshot().app).toEqual(backup.app);
  expect(
    appSchema.parse({ watchlist: [], activeSymbol: 'AAPL', provider: 'demo' }).workspace.debug,
  ).toBe(false);
  await db.close();
});
it('removing explicit Volume keeps the legacy overlay disabled only in its timeframe', async () => {
  const db = new IndexedDBStore('volume-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  const volume = { ...ma('AAPL', 1), type: 'Volume' as const, locked: false };
  store.addIndicator(volume);
  expect(store.symbol().preferences.volumeOverrides).toEqual({ '1D': false });
  store.updateIndicator('AAPL', volume.id, { visible: false });
  expect(store.symbol().indicators[0].visible).toBe(false);
  store.removeIndicator('AAPL', volume.id);
  expect(store.symbol().indicators).toEqual([]);
  expect(store.symbol().preferences.volumeOverrides).toEqual({ '1D': false });
  expect(store.symbol('NVDA').preferences.legacyVolume).toBeUndefined();
  await store.flush();
  const reload = new AppStore(db);
  await reload.initialize();
  expect(reload.symbol().preferences.volumeOverrides).toEqual({ '1D': false });
  await db.close();
});
it('failed migration aborts the versionchange transaction without erasing legacy data', async () => {
  const name = 'bad-legacy-' + crypto.randomUUID();
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('symbols', { keyPath: 'symbol' });
      db.createObjectStore('app');
    },
  });
  const broken = { ...emptySymbol('AAPL'), indicators: [{ ...ma('AAPL', 24), period: 0 }] };
  await old.put('symbols', broken);
  old.close();
  const db = new IndexedDBStore(name);
  await expect(db.load()).rejects.toThrow();
  const untouched = await openDB(name, 1);
  expect(await untouched.get('symbols', 'AAPL')).toEqual(broken);
  expect(untouched.version).toBe(1);
  untouched.close();
});
it('re-enabling a missing drawing reference invalidates safely before backup', async () => {
  const db = new IndexedDBStore('orphan-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  const orphan = alertSchema.parse({
    id: 'orphan',
    symbol: 'NVDA',
    timeframe: '1D',
    kind: 'drawing',
    drawingId: 'missing',
    direction: 'cross',
    enabled: true,
  });
  store.updateAlerts([orphan]);
  expect(store.getSnapshot().app.alerts[0]).toMatchObject({
    enabled: false,
    invalidReason: 'Referenced drawing was deleted',
  });
  await expect(store.export()).resolves.toHaveProperty('version', 3);
  await db.close();
});

it('failed import transaction restores the original workspace after its clear already ran', async () => {
  const db = new IndexedDBStore('abort-import-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  store.addIndicator(ma('AAPL', 24));
  const original = await store.export();
  const incoming = structuredClone(original);
  incoming.app.activeSymbol = 'NVDA';
  incoming.symbols = [{ ...emptySymbol('NVDA'), indicators: [{ ...ma('NVDA', 43), scope: { timeframe: '1D' as const } }] }];
  const nativePut = IDBObjectStore.prototype.put;
  const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const request = nativePut.call(this, value, key);
    if (this.name === 'symbols') this.transaction.abort();
    return request;
  });
  try {
    await expect(store.import(JSON.stringify(incoming))).rejects.toThrow();
  } finally {
    failure.mockRestore();
  }
  expect(store.getSnapshot().app).toEqual(original.app);
  expect(store.symbol('AAPL').indicators.map((i) => i.period)).toEqual([24]);
  const retained = await db.load();
  expect(retained.app).toEqual(original.app);
  expect(retained.symbols).toEqual(original.symbols);
  await db.close();
});
