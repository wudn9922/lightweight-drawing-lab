import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { it, expect, vi } from 'vitest';
import { IndexedDBStore } from '../src/storage/IndexedDBStore';
import { AppStore } from '../src/app/AppStore';
import { appSchema, emptySymbol, parseSettings, alertSchema } from '../src/storage/schema';
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
  expect(backup.version).toBe(2);
  expect(backup.app.alerts).toEqual([]);
  expect(
    parseSettings(JSON.stringify({ version: 1, exportedAt: 'legacy', app, symbols })).symbols,
  ).toEqual(symbols);
  await db.close();
  const reopened = await openDB(name);
  expect(reopened.version).toBe(2);
  reopened.close();
});
it('presets copy into each symbol and cannot share instance references or mutate locked originals', async () => {
  const db = new IndexedDBStore('preset-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  store.addIndicator(ma('AAPL', 24));
  const id = store.saveIndicatorPreset('Structure', 'AAPL');
  store.applyIndicatorPreset(id, 'NVDA');
  store.applyIndicatorPreset(id, 'AMD');
  const nv = store.symbol('NVDA').indicators[0],
    amd = store.symbol('AMD').indicators[0];
  expect(nv.id).not.toBe(amd.id);
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
it('removing explicit Volume does not unexpectedly resurrect the legacy overlay', async () => {
  const db = new IndexedDBStore('volume-' + crypto.randomUUID()),
    store = new AppStore(db);
  await store.initialize();
  const volume = { ...ma('AAPL', 1), type: 'Volume' as const, locked: false };
  store.addIndicator(volume);
  expect(store.symbol().preferences.legacyVolume).toBe(false);
  store.updateIndicator('AAPL', volume.id, { visible: false });
  expect(store.symbol().indicators[0].visible).toBe(false);
  store.removeIndicator('AAPL', volume.id);
  expect(store.symbol().indicators).toEqual([]);
  expect(store.symbol().preferences.legacyVolume).toBe(false);
  expect(store.symbol('NVDA').preferences.legacyVolume).toBeUndefined();
  await store.flush();
  const reload = new AppStore(db);
  await reload.initialize();
  expect(reload.symbol().preferences.legacyVolume).toBe(false);
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
  await expect(store.export()).resolves.toHaveProperty('version', 2);
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
  incoming.symbols = [{ ...emptySymbol('NVDA'), indicators: [ma('NVDA', 43)] }];
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
