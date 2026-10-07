import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  appSchema,
  symbolStateSchema,
  exportSchema,
  type SymbolState,
  type AppSettings,
  type SettingsExport,
} from './schema';
interface AtlasDB extends DBSchema {
  symbols: { key: string; value: SymbolState };
  app: { key: string; value: AppSettings };
}
export const defaultApp: AppSettings = appSchema.parse({
  watchlist: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META', 'GOOGL', 'AMZN'],
  activeSymbol: 'AAPL',
  provider: 'demo',
});
export class IndexedDBStore {
  private db: Promise<IDBPDatabase<AtlasDB>>;
  constructor(name = 'atlas-terminal') {
    this.db = openDB<AtlasDB>(name, 2, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('symbols', { keyPath: 'symbol' });
          db.createObjectStore('app');
        }
        if (oldVersion === 1) {
          // idb exposes a separate completion promise even during versionchange.
          // Observe its rejection while the open request still reports migration failure.
          void tx.done.catch(() => undefined);
          try {
            const app = await tx.objectStore('app').get('settings');
            if (app) await tx.objectStore('app').put(appSchema.parse(app), 'settings');
            let cursor = await tx.objectStore('symbols').openCursor();
            while (cursor) {
              await cursor.update(symbolStateSchema.parse(cursor.value));
              cursor = await cursor.continue();
            }
          } catch {
            tx.abort();
          }
        }
      },
    });
  }
  async load() {
    const db = await this.db;
    const [app, symbols] = await Promise.all([db.get('app', 'settings'), db.getAll('symbols')]);
    return {
      app: app ? appSchema.parse(app) : structuredClone(defaultApp),
      symbols: symbols.map((s) => symbolStateSchema.parse(s)),
    };
  }
  async saveSymbol(s: SymbolState) {
    await (await this.db).put('symbols', symbolStateSchema.parse(s));
  }
  async saveApp(s: AppSettings) {
    await (await this.db).put('app', appSchema.parse(s), 'settings');
  }
  async export(): Promise<SettingsExport> {
    const { app, symbols } = await this.load();
    return exportSchema.parse({ version: 2, exportedAt: new Date().toISOString(), app, symbols });
  }
  async import(data: SettingsExport) {
    const validated = exportSchema.parse(data),
      db = await this.db;
    const tx = db.transaction(['symbols', 'app'], 'readwrite');
    // A request failure can exit before the final await; observe the abort rejection.
    void tx.done.catch(() => undefined);
    await tx.objectStore('symbols').clear();
    for (const s of validated.symbols) await tx.objectStore('symbols').put(s);
    await tx.objectStore('app').put(validated.app, 'settings');
    await tx.done;
  }
  async close() {
    (await this.db).close();
  }
}
