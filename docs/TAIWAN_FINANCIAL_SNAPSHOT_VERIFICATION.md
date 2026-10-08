# Taiwan and SEC snapshot verification checkpoint

**Status: implementation and local verification complete (95%); source publication and remote verification remain pending.** The current public deployment remains the previously verified drawing-picker/ATR build. Independent external review and physical iPhone/iPad UAT remain pending.

## Latest verification checkpoint

- Final clean `npm ci`, 218 unit tests across 29 files (10.23 seconds), lint, and normal/Pages builds passed. Build entries are normal `index-DosxrleW.js` and Pages `index-DrWcVxeh.js`; the Pages output includes `AtlasNarrowAxis-Regular-cfs3IgyN.ttf` (115.57 KB) and the matching full OFL text.
- Corrected Atlas Narrow Axis font SHA-256: `5e465e809833ef0fa73c5a65827e921c0e02aba1facc263d606838c1bd126d1f`. Sol independently passed all 694 glyph geometries. The corrected integrated axis check passed all four profiles in 16.5 seconds; fresh read-only measurement showed at least 30.8% width reduction for ordinary samples across profiles. Root inspected the corrected iPhone 13 raster and confirmed separated numeric glyphs. P1-AXIS-06 is closed; the old overlapping-font evidence is superseded.
- Final normal browser gate: 126 passed / 10 original expected skips / 0 failed in 12.8 minutes. Final Pages browser gate: 32 passed / 0 failed in 2.8 minutes. Combined: 158 passed / 10 original expected skips / 0 failed. The earlier Pages PWA fixture failures were corrected in the test harness after the service worker bypassed a mocked AAPL route; assertions were preserved.
- Local collection produced 16 US financial packs. The 26-entry market catalog has 25 available symbols and one partial entry: `0050.TW` is missing 1W and 1M because Yahoo returned an unhealed null daily close. The official Taiwan directory has 2,251 entries; the other five selected Taiwan symbols currently have all seven timeframes. FIN-01/02 and TW-03/04 are closed, including Backtest full-result metadata coverage.
- All local gates pass. Source publication, hosted HTTP verification, and new live WebKit evidence remain pending; prior V1 and drawing-picker/ATR gates are not counted as passes for this extension.

## Scope frozen for this extension

- SEC snapshots reuse `FinancialNormalizer` without changing quarter/EPS derivation, null handling, or provenance. Normalized snapshot schema v1 is independent from version-4 settings/export.
- Pages serves same-origin normalized packs for the existing 20 US symbols. The SEC collector filters the mixed market-symbol list to US market profiles, excludes Taiwan symbols from SEC requests/manifest, and marks US-profile issuers or ETFs without supported companyfacts unsupported while retaining prior valid packs. SEC facts are collected in Actions; the browser does not call SEC.
- Generated packs and the collector manifest are written under `public/financial-data/` and excluded from Git. A dedicated Actions cache preserves valid packs between hourly weekday runs. Snapshot age is 24 hours; the browser cache is bounded and disposable, and reports fresh/cached/stale/offline state.
- A failed SEC ticker retains its last valid pack when possible and reports its state. Partial SEC errors do not block price deployment. No metrics are synthesized to fill gaps.
- Taiwan market coverage adds `2330.TW`, `0050.TW`, `2317.TW`, `2454.TW`, `6488.TWO`, and `8069.TWO`, while retaining the US20 set. `public/symbols/taiwan.json` is the committed, schema-validated fallback from official TWSE/TPEx directories. Refresh failure leaves that fallback intact.
- Taiwan is TWD / `Asia/Taipei`, with a 09:00–13:30 regular session. Calendar handling must not invent holiday data. Ambiguous bare codes require an explicit `.TW` or `.TWO` suffix. Taiwan SEC financials and a TSM ADR alias are unsupported.
- Settings/database/export remain version 4. Full Yahoo backend coverage may accept other explicit Taiwan symbols; static snapshots only cover the six named symbols.
- The axis target is minimum width zero, 11px, `minMove: 0.01`, full precision, and a 70%-horizontal Barlow Condensed derivative named Atlas Narrow Axis under SIL Open Font License 1.1 (see [OFL.txt](../src/assets/fonts/OFL.txt)). P1-AXIS-06's corrected font scales both glyph advances and outlines; its SHA-256 is `5e465e809833ef0fa73c5a65827e921c0e02aba1facc263d606838c1bd126d1f`. Sol independently passed all 694 glyph geometries. The corrected integrated axis check passed all four profiles, fresh read-only measurement showed at least 30.8% width reduction for ordinary samples, and root's iPhone 13 raster inspection confirmed separated glyphs; P1-AXIS-06 is closed. The previous overlapping-font evidence is superseded. Only redundant trailing zeros may be trimmed; do not round coarser, abbreviate, hide/crop labels, or use 8px text. The chart font affects time-axis labels; company UI fonts remain unchanged. Startup waits up to five seconds for the preloaded font then falls back to system font, where width savings are not guaranteed.

See [ADR-013](architecture/ADR-013-static-fundamentals-and-taiwan.md) for the accepted design and workflow lifecycle.

The local symbol and fundamentals refreshes generated the directory and pack counts reported above. Those local outputs do not establish a hosted Actions refresh or deployment. The official-directory command is `node scripts/refresh-symbols.mjs`; it writes the validated Taiwan directory atomically. The SEC collector command is `node scripts/refresh-fundamentals.mjs`.

## Publication and remaining evidence

The clean install, 218-unit/29-file suite, lint, normal/Pages builds, four-profile browser regressions, Taiwan symbol/profile/timing, snapshot provider/collector and source-finding regressions all pass. FIN-01, FIN-02, TW-03, TW-04 and AXIS-06 are closed. Remaining steps are deployment and remote evidence:

1. Publish the reviewed source, including the final bundled font and full OFL text.
2. Verify hosted HTTPS asset hashes against the tested Pages build and run the planned WebKit smoke. Confirm same-origin SEC snapshots, delayed/offline/stale and unavailable states remain truthful, and no SEC/backend requests occur. Record timestamped evidence separately; automated WebKit is not physical iPhone/iPad UAT.
3. Complete independent Gemini/Claude review and physical iPhone/iPad UAT separately; no such sign-off is claimed here.

## Data and operational limits

SEC snapshots are normalized historical filing facts for a US-only allowlist, not a live filing query. Taiwan symbols are excluded from SEC collection; US-listed issuers/ETFs without supported companyfacts remain explicitly unsupported. A pack older than its 24-hour freshness interval is stale even if it remains usable as validated offline data. Missing SEC coverage stays missing. Taiwan price snapshots are delayed and limited to the six listed symbols; the official directory does not imply static quote availability for every listing. A scheduled market-session model is not an official Taiwan holiday calendar. Taiwan bar counts may include a separately marked 13:30 close observation. The latest local collection has 16 US financial packs; 0050.TW's weekly/monthly market data is unavailable due to an unhealed Yahoo daily null. No deployment or live verification is claimed. Independent external review and physical-device UAT remain pending.
