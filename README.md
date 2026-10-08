# Atlas Research Terminal — V1

A Web-first stock research terminal with an original interface, one Lightweight Charts 5.2.1 implementation, and a separate drawing engine. V1 extends the accepted Phase 1/2 workspace; it does not replace it. Core development, offline Demo mode and tests require no paid subscription, API key, credit card or commercial chart license. This project does not use TradingView proprietary source or Advanced Charts.

V1 baseline engineering verification: **135 unit tests and 78 browser cases passed (10 expected skips)**. The authorized Pages hosting extension passed **136 unit tests, lint, normal/Pages builds, and 86 browser cases (10 expected skips)**. Independent review and physical iPhone/iPad UAT remain pending; see the evidence links below.

## GitHub Pages

The same Atlas source supports the project path `/lightweight-drawing-lab/`. Implementation and local verification are ready; source publication and GitHub Pages deployment succeeded on 2026-10-07. **Open [Atlas](https://wudn9922.github.io/lightweight-drawing-lab/) in your browser.** HTTPS resources and remote iPhone WebKit were verified; physical Safari UAT remains pending (see hosting verification). The Pages build is separate from the normal local build:

```sh
npm ci
npm run build:pages
npm run test:pages
```

`dist-pages/` contains only static files. `.github/workflows/pages.yml` builds and deploys it after a commit to `main`; the repository is already configured with **Settings → Pages → Source → GitHub Actions**. The verified URL is `https://wudn9922.github.io/lightweight-drawing-lab/`. To preview locally, run `VITE_STATIC_HOSTING=1 VITE_PUBLIC_BASE=/lightweight-drawing-lab/ npx vite preview --outDir dist-pages --port 4175` and open that project path. `npm run test:pages` starts its own isolated preview, so stop a manual server on 4175 before running the tests.

GitHub Pages cannot run the existing Node Yahoo/SEC proxies. **Real Yahoo delayed snapshots (including SMCI/NFLX), split/dividend markers, Demo, drawings, indicators, Watchlist, local persistence, research backtests, foreground alerts and settings backup work; the live Yahoo API and SEC financials still require a backend.** The UI says so, disables selecting Yahoo, and never substitutes fabricated financials. Valid imported settings keep their saved provider; an imported Yahoo selection shows a backend-required error with a manual Demo button. Static Yahoo bypasses its local market cache so cached results cannot conceal missing backend availability. The normal `npm run dev` / `npm run build` / `npm run preview` paths retain the existing providers and backend behavior.

The manifest, icons, assets, worker scope and offline caches follow the project path. Cache cleanup is confined to this registration scope; other GitHub Pages apps' caches are preserved. PWA installation requires HTTPS and a first online load. IndexedDB belongs to the hosting **origin**, not the path: another Atlas app on the same `username.github.io` origin shares its database; local Cloud settings are not transferred automatically. Export locally and Import on Pages to transfer them. See [hosting ADR](docs/architecture/ADR-010-static-hosting.md) and [hosting verification](docs/PAGES_VERIFICATION.md).

## Monthly/timeframe ownership and real prices (2026-10-07)

Select **Yahoo · 延遲快照** in Market data source to view actual Yahoo prices on Pages; **Demo is fictional, not current market data**. Snapshots are refreshed by the existing free public GitHub Actions workflow on commits/manual dispatch and best-effort hourly weekday schedules. They are not streaming or guaranteed current. Source, quote timestamp, retrieval timestamp and split-adjusted price basis remain visible; aged/offline data is marked. Yahoo already adjusts quote OHLC for splits: SMCI/NFLX are never divided a second time. Dividend-adjusted `adjclose` is not used. Native weekly/monthly history remains unchanged; only the current in-progress period is rebuilt from validated daily OHLCV and carries derivation provenance (`本週 K由日 K彙總` / `本月 K由日 K彙總`). A latest-session daily row is never added again to native aggregate volume.

Covered tickers: AAPL, MSFT, NVDA, TSLA, AMD, META, GOOGL, AMZN, NVO, SMCI, NFLX, JPM, WMT, XOM, SPY, QQQ, AVGO, PLTR, MU, TSM. Unsupported tickers or failed intervals show unavailable rather than invented prices. Maintain `scripts/market-symbols.json` to extend the public allowlist. To collect locally before building Pages:

```sh
node scripts/refresh-market.mjs
npm run build:pages
```

Generated `public/market-data/` files are not committed; the workflow collects and publishes them, retaining previous successful packs via its cache when daily refresh fails. A failed interval is omitted, and a pack never mixes new adjustment data with old intervals. No key/account/card is required. This is an unofficial prototype; production availability and redistribution rights are not guaranteed.

**1M is calendar-month data**, including future whitespace and conservative monthly closed-bar research. MA/EMA/Volume, drawings, presets, alerts and undo history are now independently owned by symbol + timeframe. Version3 migration preserves every ID/anchor/style/lock: old global MAs go to the last preferred timeframe (their creation timeframe was never stored), and drawings go to the first anchor's timeframe. The panel explains the inferred MA home; all buckets remain in Export. Do not clear browser site data. JSON1/2 imports are validated then atomically upgraded; invalid imports leave current settings intact. See [ADR-011](docs/architecture/ADR-011-timeframe-ownership-and-snapshot-prices.md) and [UAT extension verification](docs/TIMEFRAME_PRICE_VERIFICATION.md).

## Install, run and verify

Node 22.12+; this Cloud session uses Node 24.19.0.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. In Codex Cloud use the existing environment's Preview/port-forward control for port 5173 if available. No external deployment is assumed.

```sh
npm test
npm run lint
npm run build
npm run preview
npx playwright install --with-deps chromium webkit
npm run test:browser
```

Playwright covers desktop Chromium, mobile Chromium, iPhone WebKit and iPad WebKit. Production offline-shell tests expect `npm run preview -- --port 4173 --strictPort` to be running as well as the development server. WebKit offline tests briefly start their own isolated preview on 4174 and stop it after caching the shell.

In this Cloud session the browsers and temporary WebKit libraries use:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers \
LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu \
npm run test:browser
```

The downloaded WebKit launcher preserves that library path. Skipping its host check avoids an ldconfig-only false negative for the extracted libraries; the actual browser still launches and runs tests. A normal system installation does not need this Cloud workaround. See [V1 verification](docs/V1_VERIFICATION.md), [SEC validation](docs/SEC_V1_VALIDATION.md), and the retained [Phase 1](docs/VERIFICATION.md) / [Phase 2](docs/PHASE2_VERIFICATION.md) reports. Headless RAF scheduling is not physical-device FPS.

## Daily use

Phone chart controls: **Enter chart fullscreen** expands the same chart and **Exit chart fullscreen** returns to the workspace. Safari versions without element fullscreen use a chart focus layout; browser chrome remains. Add to Home Screen for a standalone PWA. Zoom buttons live on the drawing rail, outside the plot/volume area. The compact legend shows SMA/EMA values for the crosshair candle, or the latest candle when no real candle is selected. **Manage indicators** opens the existing per-symbol controls. Volume bars match candle direction (green close ≥ open, red close < open) with a fixed **20-bar volume SMA**; its first19bars are N/A, not zero. An explicit Volume indicator's color styles the average line, and Hide controls both series.

1. Enter a normalized ticker in **Symbol search** or select a Watchlist entry. Recent symbols and the Watchlist appear as suggestions; optional known company names and available cached quote/change labels are shown. Manage Watchlist provides add/remove/reorder with persistent order.
2. For AAPL, open **Indicators** (phone bottom **SMA**), choose SMA, add periods **24** and **58**. Switch to NVDA and add **43** and **56**. Each symbol AND timeframe owns independent indicator instances, styles, locks and drawings. Select 1D/1W/1M first, then configure that bucket; 1D never shows 1W settings. Chart preferences are restored per timeframe. SMA and EMA support open/high/low/close; Volume uses provider volume. Eye remains available while locked; period/source/style/removal require unlock.
3. Save a named indicator preset, then apply it to another ticker. Applying creates new instances rebound to the selected symbol and timeframe; changing one bucket cannot mutate the preset or another bucket. Zero, one or many indicators are supported.
4. Select a drawing tool on the rail. **Press → Drag → Release** defines each control point: one release for Horizontal/Vertical Line, two for Trend, Ray, Rectangle, Fib and measurements, three for Parallel Channel. The third channel point defines width. Selected endpoints/corners/width handles edit anchors; dragging the body moves the immutable original snapshot. Touch shows a precision loupe and uses large invisible hitboxes.
5. Lock in the floating drawing toolbar or Drawings panel. Locked drawings stay selectable; dragging them pans the chart. Settings exposes line width/style/opacity/visibility, rectangle/channel fill and Fib levels/labels. Workspace Settings saves per-tool defaults for new drawings. Defaults are copied rather than shared.
6. **Show future area** reveals whitespace to the right of actual candles. Draw there without fake OHLC. Magnet applies only to placement/anchor edits near actual candle O/H/L/C, never whole-object moves or future space. Undo/redo: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z; Escape cancels, Delete removes an unlocked selection. Input fields keep their ordinary keyboard behavior.
7. Open **Financials**, choose Quarterly/Annual and fiscal period. Overview, Income Statement, Cash Flow and Balance Sheet expose Revenue/EPS/Net Income/FCF histories, margins and fiscal YoY/QoQ. Select a value for concept/unit/form/filing/accession/period and raw/derived calculation lineage. Financials are actual SEC facts even when prices are visibly simulated Demo data.
8. Open **Research → Backtest**. Choose MA Cross or Price Cross MA, SMA/EMA periods, long/short direction, capital and optional commission/slippage. Signals are formed on closed bars and fills occur at the **next bar open**. Results show trades, win rate, total return, drawdown, average trade, profit factor, exposure, date range and chart entry/exit markers. This is research, not brokerage execution.
9. Open **Research → Alerts**. Create a level, moving-average or Horizontal Line/Ray cross alert; enable/disable/delete as needed. Alerts evaluate the **selected symbol/timeframe only**, once per minute while the page is visible. Initial history establishes a baseline without replaying historical alerts. Moving a referenced drawing resets its baseline; deletion invalidates the alert. Closing the app stops evaluation; there is no background monitoring or push service.
10. **Export settings** backs up every symbol plus Watchlist, drawings/styles/defaults, indicators/presets, locks, alerts and workspace/chart preferences. **Import settings** validates first and atomically replaces settings. Export a backup first. Invalid imports and failed migrations preserve existing stored data. SEC facts, market cache and backtest results are excluded.
11. Install the PWA from a supported browser or iOS Safari **Share → Add to Home Screen**. HTTPS/localhost is required. Production caches its shell; local settings and Demo work offline. Missing live data shows unavailable; an expired cached response is explicitly stale.

## Architecture

```text
src/app/          React shell, workspace preferences, commit-only AppStore
src/chart/        one ChartEngine, coordinate transforms, Future TimeMapper
src/drawing/      controller/state machine/primitive renderer/hit testing,
                  magnet/snapshot movement/history/loupe/persistence
src/tools/        tool-specific line/ray/rectangle/Fib/channel/measurement geometry
src/indicators/   registry/engine, SMA/EMA and Volume instances
src/market-data/  normalized providers, deterministic Demo, Yahoo proxy, TTL cache
src/fundamentals/ SEC backend/client, CIK resolution, concept/period normalization,
                  lineage, fiscal growth/margins and filing events
src/strategy/     pure StrategyEngine and BacktestEngine, signals and metrics
src/alerts/       local definitions, closed-bar evaluation and drawing references
src/storage/      versioned schemas, IndexedDB migration, atomic backup/import
src/errors/       scoped user errors; panel boundaries isolate render failures
src/ui/           accessible panels, controls, charts and mobile/tablet drawers
apps/native/      optional Capacitor wrapper configuration for the same Web build
```

[ADRs 001–009](docs/architecture/) record engine, drawings, indicators, providers, financial correctness, backtest execution, alerts, storage and PWA/native boundaries. Official chart and primitive-authoring skills are vendored under `.agent-skills/` because Cloud `.agents` is protected. The installed 5.2.1 typings and public Primitive/marker APIs are the implementation reference.

### Drawing and rendering model

Anchors `{time, logical, price, timeframe}` use timestamp and price as canonical coordinates; logical is advisory across timeframe/history changes. Every object owns symbol, visible/locked state, scope, style and tool anchors. Fib has one level list; channel has three anchors, measurements two. Screen pixels exist only in transient projections. Timeframe changes remap timestamps rather than interpreting old logical indices as new bars.

Pointer movement updates mutable interaction state, coalesced into at most one RAF primitive redraw; it does not rerender React or write storage. Releases commit app state. Native chart handlers are restored on all exits. Whole-object moves always use drag-start snapshots and preserve shape; commit rechecks locks. Endpoint visuals are small while touch hitboxes are independent. The 180×125 CSS-pixel, 2.75× loupe centres on the actual constrained/snapped release candidate. Chart `touch-action:none` and pointer capture own gestures without page-scroll corrections. OHLC/crosshair updates stay outside React pointer hot paths.

### Indicators and storage

Indicator instances are keyed by id and owned by symbol plus a required timeframe: SMA/EMA/Volume, period/source, visible/locked, color/width. EMA is SMA-seeded; source changes recompute only the affected series. Explicit Volume instances take control from the legacy overlay; hiding/removing Volume cannot silently restore that overlay.

IndexedDB `atlas-terminal` **version 3** keeps `symbols` and `app` stores. The v1/v2 migrations preserve drawings, indicators, locks, order and preferences, then assign legacy global objects a timeframe owner. Failed upgrades abort; failed import does not clear current data. Commit writes are serialized; export awaits writes and refuses unresolved storage errors. Version-3 JSON backups also accept validated legacy v1/v2 envelopes. Drawings and their session-local 200-command histories are isolated by symbol and timeframe; indicators and volume preferences are scoped the same way. There is no localStorage settings store. Clearing browser data removes the workspace; JSON export is the portable backup.

### Market data and events

Providers expose normalized OHLCV/quotes/capabilities/events rather than raw responses. Demo supplies **2,500 deterministic simulated bars**, fixed as-of 2026-10-05, for 5m/15m/30m/1H/4H/1D/1W, and600 calendar-based completed 1M bars. Yahoo exposes available direct timeframes through capability metadata; unsupported 4H is hidden. Yahoo is an unofficial free prototype: **Prototype only，不保證 production availability。** Vite dev/preview includes a fixed-destination proxy, no paid key. Static hosting uses the distinct SnapshotProvider for real delayed data; the live API/native mode needs an equivalent backend. There is no silent Demo substitution.

The separate bounded `atlas-market-cache` database keys provider identity/symbol/timeframe/range, deduplicates concurrent requests, retains at most 150 responses and uses provider TTL (Yahoo 60 seconds, Demo one day). Offline fallback is marked stale; quote source/as-of/delayed/simulated state stays visible. Watchlist fetches cached available quotes without polling. Manual refresh updates the chart snapshot. Bars are not represented as a guaranteed real-time or certified adjusted feed.

Reliable provider splits/dividends use markers and recorded raw values/ratios; Demo reports events unavailable. SEC 10-Q/10-K filing markers are labelled **SEC Filing**, not invented earnings announcements. They are added when financial records load. Marker kinds coexist with backtest entry/exit markers without creating another chart engine.

### Fundamentals and correctness

SEC EDGAR uses generic ticker/CIK mapping, identification User-Agent, 2 requests/second throttling, caching and request deduplication. Only the backend reads SEC response shapes. For standalone SEC service:

```sh
npm run build
SEC_USER_AGENT='Your organization your-real-contact@example.com' npm run serve:fundamentals
```

Use your real identification/contact. Default local identification truthfully describes Atlas research. The standalone service listens on 127.0.0.1:8788; configure SEC_HOST/SEC_PORT and reverse-proxy `/api/fundamentals`. SEC CORS prevents a static frontend from directly replacing this backend. Multi-instance production needs shared cache/rate limiting. No secrets are bundled. SEC errors do not interrupt drawings/chart.

All metrics may be null (shown N/A). Concept priority mappings include revenue alternatives, bank revenue net of interest expense, cost/net income/EPS/OCF/CapEx/cash/equity fallbacks, without guessing overlapping totals. Balance-sheet facts are instant; income/cash flow are duration. Compatible Q2/Q3/Q4 cumulative subtraction records derived lineage; ambiguous periods remain missing. EPS is never obtained by subtracting cumulative EPS. FCF is derived **OCF − CapEx**, only when both exist. Margins require nonzero revenue. YoY/QoQ use fiscal keys, not array position. Forms, filing dates, accession, raw concept/unit/period and derived calculations remain auditable.

Official fixtures and live smoke cover AAPL, MSFT, NVDA, TSLA, JPM, WMT and XOM. Current XOM resolves to ExxonMobil Holdings CIK 2115436, with limited holding-company history; the historical CIK 34088 fixture is separately labelled and never overrides current ticker resolution. See [expanded SEC validation](docs/SEC_V1_VALIDATION.md). Optional network smoke: `npm run test:sec-live` and `node scripts/sec-v1-smoke.mjs`. Ordinary regression tests use auditable official test fixtures without network or fabricated financials.

### Backtests and alerts

Strategy/backtest modules operate on explicitly closed bars, use no future values for signals and fill at next-bar open. One position uses current equity notional, no leverage/pyramiding; fees/slippage are configurable. Final open positions are marked to the last closed close, never given a fabricated exit. Short insolvency truncates with an explicit warning rather than invented liquidation. Profit factor without losses is N/A; marked total return/drawdown include open positions, while win rate/average trade use closed trades. Yahoo adjustment/execution quality is not certified.

Alert definitions persist; evaluation is active-page-only, current symbol/timeframe, closed-bar/high-water deduplicated, with baseline initialization and transition re-arming. Drawing moves reset baselines; deletion disables invalid references. Future server-side alerts can implement the same contract. V1 sends no orders and provides no always-on notifications.

## Mobile, PWA and native

Desktop supports chart with contextual panels; iPhone uses bottom sheets/tabs without permanently shrinking the chart. iPad uses a wider contextual panel while retaining chart pan/drawing access. Forms/actions have accessible labels, keyboard focus and 44px targets; controls are not hover-only. Safe-area CSS handles notches/home indicators. Debug is OFF by default and exposes source, symbol/timeframe, counts, storage and errors when enabled.

The production-only versioned service worker caches shell/assets and excludes API responses. HTTPS/localhost is required for installation. Native configuration/documentation under [apps/native](apps/native/) reuses the same Web build; Xcode, signing, device testing and Android SDK are separate platform tasks, not Cloud Web blockers.

## Limitations and next work

- **Physical Device UAT Pending:** real iPhone/iPad drawing feel, loupe latency, touch accuracy, scroll/pinch, long-session performance, PWA install and safe-area behavior. Headless WebKit is not a physical Safari verification.
- Exchange schedules handle Eastern DST/weekends, not exchange holidays/early closes. Future whitespace horizon is 500 bars; eventual holiday/session dates can differ. Intraday partial sessions are conservative.
- Timestamp anchors stay fixed across timeframe/provider changes, but different history windows may leave objects outside the viewport. Manual vertical price-scale range is not persisted.
- Undo is session-local; settings/locks persist. Import replaces the workspace and clears history.
- Yahoo is an unofficial delayed research source with no availability or adjustment guarantee. Corporate events may be unavailable; never guessed.
- SEC custom extensions/IFRS/unusual fiscal transitions are conservative N/A. Q4 EPS frequently remains N/A. Derived cumulative values depend on compatible reported inputs; inspect lineage for restatement differences.
- Alerts stop when inactive/closed and monitor the selected chart only. Backtests have simplified execution, no borrow/margin/holiday/split correction engine, and are research signals rather than trading advice or brokerage orders.
- Gemini/Claude independent review remains external; [REVIEW_PACKAGE.md](REVIEW_PACKAGE.md) includes scopes, primary triage and reviewer instructions. No independent sign-off is claimed.

V1 retains all Phase 1/2 regression gates. Further development requires explicit V2 authorization; no brokerage, auto trading, accounts/cloud sync, screener, news, options, payments or Pine clone is added here.

## Attribution

[TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/) is Apache-2.0; its attribution link remains visible. Atlas assets and drawing interaction code are original. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
