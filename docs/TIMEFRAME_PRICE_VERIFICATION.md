# Monthly, timeframe isolation and actual delayed prices — verification

Environment: same Atlas Cloud workspace, Node24/npm11, 2026-10-08. Same workspace and source tree; no archive extraction, project recreation, paid dependency, or frontend credentials.

Current status: **Current-price extension implementation 100%; verification 95%.** P1-CURRENT-03 is accepted, fixed, and closed by Sol's read-only review. All local gates pass; corrected source publication and fresh live close-versus-quote proof remain pending. Do not mark V1 complete. The prior source was published without force to `main` as [commit 882b908b0d617b1204afbdceaf919e8efe3244b0](https://github.com/wudn9922/lightweight-drawing-lab/commit/882b908b0d617b1204afbdceaf919e8efe3244b0); [Hosted Actions run 37707186178](https://github.com/wudn9922/lightweight-drawing-lab/actions/runs/37707186178) succeeded for that revision. Prior TLS-enabled HTTP and iPhone WebKit records are [here](timeframe-price-live-http.json) and [here](timeframe-price-live-browser.json), captured 2026-10-08 at 00:23:20 UTC. Those checks validated assets, quote metadata, and app journeys but did **not** compare the latest 1W/1M bar close to the daily quote. No corrected source commit or deployment is claimed. Independent external review and physical-device UAT remain pending.

### P1-CURRENT-03 — source fix closed; publication and live proof pending

The previous live SMCI pack reported a $44.94 regular-market quote as of 2026-10-07 20:00 UTC, while its native current 1M aggregate still closed at $43.46 on 2026-10-06. The accepted source fix heals only a validated missing latest daily close from matching regular-market metadata, requires the fresh daily latest bar's UTC date and close to match the pack quote, and reconstructs only the current 1W/1M bucket from validated daily OHLCV. Native historical bars are preserved; provenance records healing and current-period derivation. Snapshot v3 rejects 1D/latest-current-period bars whose UTC date/bucket or close disagree with the quote. On a failed interval guard the interval is omitted; if fresh daily quote data is missing or inconsistent, preserve the entire prior snapshot with its old timestamps. The collector fetches 1D after 1W/1M so the quote metadata is at least as recent as the native payload. Sol's read-only review accepted and closed the source finding.

### P2-CURRENT-04 — accepted proxy cache retry

A fresh native 1W/1M response can be newer than a still-fresh cached raw daily payload. The proxy now retries the fixed-host 1D10y request once, with the same timeout signal, only when the helper reports that the cached daily metadata is older than the native period response. It replaces the cached payload and retries normalization once; unrelated errors do not trigger a retry. The focused middleware regression passes.

### Current correction gates

- Clean `npm ci`: PASS.
- Full `npm test`: 167 passed across 20 files in 9.43 seconds.
- `npm run lint`: PASS; `npm run typecheck`: PASS.
- Schema-v3 local refresh: all 20 symbols available with all seven supported timeframes. Refreshed SMCI daily/1W/1M close is $44.94, with 1W volume 90,284,251 and 1M volume 161,285,951. Refreshed NFLX daily/1W/1M close is $69.70, with 1W volume 102,053,115 and 1M volume 182,309,915.
- Normal and Pages builds: PASS, producing `index-DV6Ur9iz.js` and `index-B36DL1MA.js`; chart and storage chunks are unchanged.
- Normal browser gate: 98 passed, 10 original expected skips, 0 failed (12.2 minutes).
- Pages browser gate: 20 passed, 0 failed (2.1 minutes); combined browser result: 118 passed, 10 original expected skips, 0 failed.
- Corrected deployment and live latest-close-versus-quote proof: pending.

The first current-correction Pages run had four failures caused by the test fixture builder using an older filtered NFLX monthly capture without October 1/2. The fixture builder now uses actual current NFLX daily/weekly/monthly captures with provenance; all assertions remain and no product guard was loosened. The final Pages run passed all 20 cases. The original offline/PWA cases still run with the service worker enabled, and the existing 10 expected skips were not changed.

## Implemented and reviewed

Calendar1M, conservative nextmonthET00 closed-bar boundary,600Demo monthlyhistory, nativeYahoo1mo10y; v3strict symbol+timeframeownership, atomiclegacy1/2 migration/import, preservedIDs/anchors/styles/locks, migrationhomeaudit, scopedpanels/presets/Volume/alerts andbucketundo. Existing drawing gestures/oneLWC5.2.1 unchanged. QuoteOHLC splitbasis+metadata+versionedcache, SnapshotProvider/Schema3 andhourlyweekdayActions20tickerrefresh, noDemo fallback foractualpricefailures. Current-period source correction is in the workspace; local verification passes, with publication and live proof pending. SeeADR011.

Source review: GPT6.1SolHigh readonlyplan/review, Luna6Max frozenimplementation, primarytriage. P1-MONTH-01 nativeaggregate overwritten byappendeddailyrow ACCEPTED/FIXED; P1-SCOPE-02 crossTFedit callback ACCEPTED/FIXED. P1-CURRENT-03 current daily/weekly/monthly quote consistency ACCEPTED/FIXED and closed by Sol source review. P2-CURRENT-04 stale raw-daily proxy retry ACCEPTED/FIXED by primary; focused middleware test passes. Full local gates pass; corrected live proof, Gemini/Claude external independent review, and physical-device UAT remain pending.

## Previous deployed baseline gates (historical; not proof of current-price consistency)

- `npm ci`: PASS, clean locked installation.
- `npm test`: PASS, 156 tests across 19 files.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, TypeScript and normal production build.
- `npm run build:pages`: PASS, static project-path build.
- Normal browser gate: 98 passed, 10 original expected skips, 0 failed (11.5 minutes).
- Pages browser gate: 16 passed, 0 failed (1.8 minutes).
- Combined browser result: 114 passed, 10 expected skips, 0 failed.

An earlier Pages run had three test-only failures: mobile quote rows were hidden until the Watchlist drawer opened, and the service worker served the app shell instead of the mocked unknown-symbol 404. A mobile-aware quote helper and service-worker blocking for only the snapshot-mock test fixed that harness. On the latest correction, the first four Pages failures came from the old filtered NFLX monthly fixture missing October 1/2; real current NFLX captures now supply the full daily aggregation range. Original offline/PWA tests still use the service worker; assertions and skips were not reduced. Legacy v1/v2 migration fixtures remain intact while expectations account for timeframe-scope migration. Yahoo cache assertions obtain provider identity from YahooProvider and retain TTL, stale-offline, and range coverage.

Earlier concurrent browser attempts produced artifact-path conflicts. The final pre-publication gates ran sequentially with isolated normal and Pages output directories and cover P1-CURRENT-03. The previously published baseline remains live; the correction still needs publication and corrected TLS/HTTP and iPhone WebKit proof.

## Actual market-source inspection

Historical pre-correction inspection refreshed 20 allowlist tickers to snapshot schema2 with seven native intervals. SMCI/NFLX daily/nativeweekly/nativemonthly actual responses are filtered fixture files under tests/fixtures/market; provenance JSON records original URLs/capture times/SHA256. The pinned 2026-10-06 fixture quotes SMCI $43.46 and NFLX $68.69 are historical evidence, not current prices. Prior live quote observations were SMCI $44.94 and NFLX $69.70, both as of 2026-10-07 20:00 UTC; they are observations from that run, not values to assume indefinitely.

The prior October native aggregates retained SMCI close $43.46 and volume 120,881,200 (weekly volume 49,879,500), and NFLX monthly volume 152,129,500 / weekly 71,872,700. Those figures describe the captured payload only; they do not validate that the latest bucket matches a newer daily quote. Already split-adjusted quote OHLC remains undivided, `adjclose` is ignored, and future bars are never fabricated. The current schema-v3 refresh now has all 20 symbols and all seven timeframes; refreshed SMCI/NFLX quote and volume values are recorded in Current correction gates above.

## Limitations

Actual data is delayed regular-session Yahoo from an unofficial prototype. Schedules and availability are best-effort, with no execution or real-time guarantee; 20 fixed tickers are supported, and unknown symbols or failed intervals remain explicitly unavailable. SEC backend access is unavailable on Pages. Demo prices remain fictional. Legacy global MA creation timeframe cannot be recovered, so migration assigns the symbol's last preferred timeframe and explains it in the panel. Source correction, builds, and local browser gates pass; corrected publication and live current-close verification remain pending. Physical iPhone/iPad touch, loupe, pinch, scroll, PWA, safe-area, and long-session UAT remains pending; Playwright WebKit is not physical Safari. Independent external review remains pending; no FPS claim is made.
