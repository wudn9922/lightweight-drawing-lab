# Monthly, timeframe isolation and actual delayed prices — verification

Environment: same Atlas Cloud workspace, Node24/npm11, 2026-10-08. Same workspace and source tree; no archive extraction, project recreation, paid dependency, or frontend credentials.

Current status: implementation 100%, verification 95%. The current verified source snapshot has not yet been published; earlier deployment evidence applies to its own revision. Primary's next step is a non-force publish followed by TLS-enabled live HTTP and iPhone WebKit checks. Independent external review and physical-device UAT remain pending.

## Implemented and reviewed

Calendar1M, conservative nextmonthET00 closed-bar boundary,600Demo monthlyhistory, nativeYahoo1mo10y; v3strict symbol+timeframeownership, atomiclegacy1/2 migration/import, preservedIDs/anchors/styles/locks, migrationhomeaudit, scopedpanels/presets/Volume/alerts andbucketundo. Existing drawing gestures/oneLWC5.2.1 unchanged. QuoteOHLC splitbasis+metadata+versionedcache, SnapshotProvider/Schema2 andhourlyweekdayActions20tickerrefresh, noDemo fallback foractualpricefailures. SeeADR011.

Source review: GPT6.1SolHigh readonlyplan/review, Luna6Max frozenimplementation, primarytriage. P1-MONTH-01 nativeaggregate overwritten byappendeddailyrow ACCEPTED/FIXED; P1-SCOPE-02 crossTFedit callback ACCEPTED/FIXED. Primary addedcapturedTF commit andactiveTF/currentdrawing alert lookup. Bothreviewblockersclosed inlatestreadonlyreview; Gemini/Claude externalindependentreviewpending.

## Commands and current results

- `npm ci`: PASS, clean locked installation.
- `npm test`: PASS, 156 tests across 19 files.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, TypeScript and normal production build.
- `npm run build:pages`: PASS, static project-path build.
- Normal browser gate: 98 passed, 10 original expected skips, 0 failed (11.5 minutes).
- Pages browser gate: 16 passed, 0 failed (1.8 minutes).
- Combined browser result: 114 passed, 10 expected skips, 0 failed.

The first Pages run had three test-only failures: mobile quote rows were hidden until the Watchlist drawer opened, and the service worker served the app shell instead of the mocked unknown-symbol 404. A mobile-aware quote helper and service-worker blocking for only the snapshot-mock test fixed the harness. Original offline/PWA tests still use the service worker; assertions and skips were not reduced. Application source did not change after the normal browser gate; final test-only changes pass lint and typecheck. Legacy v1/v2 migration fixtures remain intact while expectations account for timeframe-scope migration. Yahoo cache assertions obtain provider identity from YahooProvider and retain TTL, stale-offline, and range coverage.

Earlier concurrent browser attempts produced artifact-path conflicts. Final gates ran sequentially with isolated normal and Pages output directories; the reported results above are the final runs. Publication and live proof for this source snapshot remain pending.

## Actual market-source inspection

All20allowlist tickers refreshedsuccessfully toschema2, each7nativeintervals. SMCI/NFLX daily/nativeweekly/nativemonthly actualresponses arefilteredfixturefiles under tests/fixtures/market; provenanceJSON recordsoriginalURLs/capturetimes/SHA256. Latestas-ofregularquotes from2026-10-06 areSMCI43.46 andNFLX68.69; thesearehistoricalevidence, notforevercurrentconstants.

SMCIcurrentOctoberaggregate: open40.88999938964844, high44.7400016784668, low40.130001068115234, close43.459999084472656, volume120881200. Weeklyvolume49879500. NFLXmonthlyvolume152129500, weekly71872700. Already10:1split-adjusted sourceOHLC retained, dividendsadjcloseignored, noadditionaldivision, nofakecandles. Currentmonthly/weeklysessionduplicate discarded ratherthansummedorusedasnewbar. Frozenfixtureunit/browser testsverifythis.

## Limitations

Actual data is delayed regular-session Yahoo from an unofficial prototype. Schedules and availability are best-effort, with no execution or real-time guarantee; 20 fixed tickers are currently supported, and unknown symbols or failed intervals remain explicitly unavailable. SEC backend access is still unavailable on Pages. Demo prices remain fictional. Legacy global MA creation timeframe cannot be recovered, so migration assigns the symbol's last preferred timeframe and explains it in the panel. The current source snapshot still needs publication and live TLS/HTTP/iPhone WebKit verification. Physical iPhone/iPad touch, loupe, pinch, scroll, PWA, safe-area, and long-session UAT remains pending; Playwright WebKit is not physical Safari. Independent external review remains pending; no FPS claim is made.
