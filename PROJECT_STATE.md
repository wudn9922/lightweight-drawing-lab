# Atlas V1 — current workspace state

Updated: **2026-10-07**. V1 remains **COMPLETE WITH EXTERNAL UAT PENDING**. Authorized GitHub Pages hosting implementation, Sol review and all local tests are complete. The user has authorized the target repository; the current GitHub App installation on wudn9922 now includes lightweight-drawing-lab. **Source committed; publication requires the repository owner to enable Pages.**

**Current exact next action:** user sets repository Settings → Pages → Build and deployment → Source to GitHub Actions. The App cannot create the Pages site (POST returns403; current grants omit administration/pages). The source commit is `5f87026e5a5983bc6199d4ffb103fd89c2f018a4`. GitHub Actions run37580250183 passed ci/unit/lint/Pagesbuild, then failed only at configure-pages because the site is not enabled. Once the setting is enabled, rerun the workflow and verify HTTPS/asset responses; no V1 implementation redo is needed.

Latest verification: clean npmci; **136 unit tests/18 files; lint; normal and Pages builds; 86 browser PASS/10 expected SKIP/0 FAIL**, all four profiles. Ready source archive: `scratch/atlas-github-pages-ready.zip`; static artifact: `scratch/atlas-pages-static-ready.zip`. Original4173preview stillHTTP200.

The following V1 baseline sections retain the accepted 2026-10-06 checkpoint; later hosting sections record the authorized extension and blocker.
V1 overall progress: **100% of authorized Cloud Web/PWA engineering scope**. Current milestone: final clean verification completed; ready for user testing. Existing /workspace remains the only source of truth. No project recreation, archive extraction, Git initialization, engine replacement or V2 work.

## Completed functionality

- Lightweight Charts 5.2.1, one candlestick engine; native pan/zoom/crosshair, OHLC header, future whitespace, responsive/PWA shell.
- Ten drawings: Trend, Horizontal, Ray, Rectangle, Fib, Parallel Channel, Price Range, Date Range, Price + Date Range, Vertical. Shared press-drag-release/selection/anchor-corner-width edit/snapshot move/lock/loupe/magnet/history/style/default/visibility/future/symbol/storage/backup infrastructure.
- Symbol-owned SMA/EMA/Volume, arbitrary multiple instances, locks/hide/show/source/styles, copied presets; AAPL24/58 and NVDA43/56 isolation/reload retained.
- Watchlist add/remove/order/selection, recent normalized tickers, cached quote labels; Demo7TF/Yahoo6directTF capabilities, provider/range TTL cache, stale/as-of/source metadata and actual/unavailable corporate events.
- SEC generic ticker/CIK/backend/throttle/cache/dedup; conservative quarterly/annual duration/instant normalization, nullable financial statements/EPS/FCF/margins/fiscal growth, lineage/trends and SEC Filing markers. Seven issuer validation patterns.
- Pure MA Cross/Price Cross MA research strategies, long/short signals, next-open no-lookahead backtests and deterministic metrics.
- Foreground selected-chart local alerts, persisted definitions/triggers, baseline/re-arm/dedup and safe drawing move/delete references.
- IndexedDB2 validated legacy migration, serialized commit persistence, export2/legacy1 import, atomic replacement/no-data-loss failure guards; workspace/default/preset/panel/provider preferences.
- Phone sheets/iPad context panels/desktop controls, keyboard guards/accessibility, isolated errors/debug OFF by default.
- Installable versioned offline PWA with local settings/Demo; isolated Capacitor8.5.2 config/lock/build script/runbook for the same Web source, safe-area handling and native service-worker guard.

## Frozen architecture

One Lightweight Charts5.2.1 and public series Primitive/marker APIs; official vendored skills apply. Canonical drawing time/price, logical advisory, no persisted pixels/fake future OHLC. Pointer geometry is outside React, coalesced one RAF, commit-only persistence. Whole moves use drag-start snapshots; magnet real endpoints only. Locked objects remain selectable and delegate native pan. Controller captures scroll/scale values by copy and suppresses compatibility Touch Events for owned drawing cycles; secondary touch cancels into native pinch.

All drawings/indicators/settings owned by symbol; presets/defaults copied. DB2 keeps original app/symbol stores and validates migration/import transactionally; cache is separate/bounded/disposable. Providers isolate payloads; Demo visibly simulated/Yahoo delayed prototype/SEC actual. Fiscal derivations require compatible concepts/units/periods/vintages and preserve provenance; no cumulative EPS subtraction or missing-as-zero.

Strategy signals use explicitly closed bars, fills next bar open, one position/current equity/default zero costs; no fabricated terminal exits or short liquidation. Alerts selected symbol/TF only while visible, baseline initialization/transition re-arm/high-water dedup; no background/broker promise. Native config bundles the same Web source; live native APIs require an HTTPS backend, not frontend secrets.

## Final verification

Clean sequence completed: npm ci PASS; npm test **135/135 PASS (17 files)**; lint PASS (zero warnings/errors); TypeScript/production build PASS; full browser **78 PASS / 10 expected SKIP / 0 FAIL / 0 flaky (88 cases)**.
DesktopChromium21PASS1SKIP; MobileChromium19PASS3SKIP; iPadWebKit19PASS3SKIP; iPhoneWebKit19PASS3SKIP. Skips are one desktop touch-only case and three controlled desktop stress scenarios on each other project. All core old/new journeys run and pass on all4. Native isolated ci/config/types/script/build-web PASS; final normal Web build restored PWA registration.

Mixed stress:2500bars/8SMAEMA/100mixed10tool objects/50locked; create-edit101st/deleteback100/panzoomcrosshair, zero runtime errors. Actual89headlessRAF samples median16.7/p9516.8ms, not deviceFPS. SEC7company fixtures/live smoke passed; final productionbackend AAPL/JPM/WMT/XOM audit smoke passed; actual YahooAAPL5m/1H/1D HTTP200. Counts are evidence snapshots, not uptime guarantees.

## Bugs found and fixed

Primary accepted/triaged all execution findings before changes. Includes latent LWC live-options restoration, compatibilityTouch long-press tracking, mobile selected-action overlay blocking pan, WebKit datalist Enter, Vertical list P2 assumption, finite strategy ratio overflow, aborted IndexedDB transaction completion rejection, explicit Volume legacy resurrection, SEC numeric-stringCIK/JPM concept fallback and stable research/alert chart updates. Final Phase1/2 regression PASS; no unresolved failing case. Full rationale in REVIEW_PACKAGE.md.

## Remaining work / blockers / reviewer

No unfinished V1 Cloud engineering milestone and no external Web blocker. **External Review Pending:** Gemini/Claude tools unavailable; REVIEW_PACKAGE.md/source review archive are the independent-review handoff, not sign-off. Findings must return to primary accept/reject triage.
**Physical Device UAT Pending:** actual iPhone/iPad drawing/loupe/touch/scroll/pinch/performance/install/safe-area/long sessions. WebKit viewport/pointer tests are not physical Safari. Native SDK builds/signing/device verification are not Cloud Web acceptance; only wrapper config/runbook was required here.
Data limits: unofficial Yahoo availability/uncertain adjustments; no exchange holiday/early-close calendar; conservative custom/IFRS/stub SEC N/A and Q4 EPS; currentXOM holding-company history distinct from historicalCIK. Local alerts selected-chart/foreground only; simplified research execution; undo session-local; native live backend not deployed. See README.

## Historical V1 next action — superseded by the authorized hosting task

**Stop engineering at V1 and let the user test. Do not begin V2.** If a later task addresses UAT/reviewer bugs, read this state, README, ADR001–009, V1_VERIFICATION and REVIEW_PACKAGE first; preserve all regression gates and the same workspace. Do not redo completed Phase1/2/V1 or extract atlas-phase1.zip.

Production preview: port4173, `npm run preview -- --port 4173 --strictPort` (active session47931 at checkpoint). SECstandalone8788, `npm run serve:fundamentals` (active session96510). Use Cloud port forwarding if supplied; no external preview URL/deployment was created. If processes expired, restart these commands in the same workspace. Dev optional `npm run dev` port5173. Browser assets/libs configured in README.

Relevant files: src/app/App.tsx/AppStore.ts; src/chart/*; src/drawing/*; src/tools/*; src/indicators/*; src/market-data/*; src/fundamentals/*; src/strategy/*; src/alerts/*; src/storage/*; src/errors/*; src/ui/*; src/styles.css; apps/native/*; tests/*; e2e/*; docs/architecture/*; docs/V1_VERIFICATION.md; docs/v1-browser-summary.json; docs/v1-performance-measurement.json; docs/SEC_V1_VALIDATION.md; docs/v1-live-backend-smoke.json; docs/v1-live-market-smoke.json; REVIEW_PACKAGE.md; README.md.

## Historical intermediate hosting checkpoint — 2026-10-07 (superseded by final results below)

Latest task explicitly authorizes committing the same workspace to `wudn9922/lightweight-drawing-lab` and serving it through GitHub. This hosting extension supersedes previous no-GitHub-Pages request; no V2/source reinitialization. V1 progress remains100%; hosting implementation/review complete, final regression/publication pending.

Frozen decisions: one unchangedV1engine/schema; separate `build:pages`→`dist-pages` with static flag and projectbase; normal local providers/build remain available. ScopedPWA cache/manifest/icons; staticYahoo/SEC explicitly backend-required, no fakefinancials; validYahoo backups restore unchanged then manualDemo; staticYahoo cache bypass prevents concealedbackendabsence. GitHubActions main workflow, no paidservices/secretfrontend/proxyworkaround.

Sol6.1High plan/read-onlyreview, Luna6Max frozenimplementation. Primary accepted removal of unplanned import rejection and generatedartifact lintignore, rejected restoring staticYahoo cachewrapping for statedavailabilityreason. New tests/docs reviewed; independentGemini/Claude review and physicalSafariUAT pending.

Passed at checkpoint: cleannpmci;136unit/18files;lint before/afterPagesbuild;normalbuild;Pagesbuild;8/8Pagesbrowsercases (allfourprofiles) includingprojectscope/cachesafety/MA+drawlockreload/validYahooimport/noAPIfetch/offlineDemo+SMA. Full88-case normalV1 regressioncurrentlyrunning; source/artifacts frozen duringbrowserrun. Original4173preview remainsrunning.

Exactnextaction: collectfullbrowserresult, fix/rerun ifneeded; updateevidence then commit source via authenticatedGitHubRESTAPI (local.gitprotected/empty; doNOTinitialize). EnablePages via supportedAPI and verifyactualHTTPSsite. Ifworkflow/Pagesintegrationpermission403, reportpreciseexternalbarrier and prepareuser-reviewablefallback. Repo wasempty/no branches atread; recheck beforewrites. Sourcepublicationallowlist172files~1.68MB excludesZIPs/node_modules/dist/scratch/secrets; credentialpatternscan clear.

Relevantfiles: `.github/workflows/pages.yml`;scripts/build-pages.mjs;vite.config.ts;index.html;src/main.tsx;public/sw.js+manifest;src/app/HostingMode.ts+App.tsx;YahooProvider/SecEdgarProvider/FinancialPanel;playwright.pages.config.ts;e2e-pages/hosting.spec.ts;tests/static-hosting.test.ts;docs/architecture/ADR-010-static-hosting.md;docs/PAGES_VERIFICATION.md.

Hosting final local gates PASS: clean npmci;136unit/18files;lint;normal+Pagesbuild;normal browsers78PASS/10expectedSKIP/0FAIL (8.1min), plus8PagesbrowserPASS (40.3sec), combined86PASS/10expectedSKIP. No Phase1/2/V1 regression. Source/artifact testing finished; next action is authenticated API commit/main then Pages enablement and real HTTPS proof.

## Publication external blocker — 2026-10-07

Hostingprogress: implementation/review/localverification COMPLETE; GitHubcommitandexternalwebsite BLOCKED. Both CLI PUTcontents and connectedcreate_file action fail403 `Resource not accessible by integration`; PagesPOSTalso403. No remotecommit created; branchliststill[]; HTTPS intendedsite404, not usableURL. Connecteduserwudn9922 but onlyavailablechatgpt-codex-connector installation152596461 belongs tosaku0827 and coverssaku0827/fast-launch-api, notwudn9922/lightweight-drawing-lab. Usermustauthorizetargetowner/repo inGitHubconnectorinstallation. No alternativeidentity/token/proxybypass wasattempted. CurrentApppermissions also do notincludePages/admin; owner mayneedenableGitHubActionsPages once aftercommit.

Exactnextaction: aftertargetrepositoryauthorization, rerun ghapi user/installations andlisttargetbranches; ifstillempty bootstrapREADME thenupload172sourcefiles+workflow viaRESTAPI andcommitmain. Sourceallowlist/tmp/atlas-source-paths.json and/tmp/atlas-publish.py aretemporaryhelpers, reconstructifexpired. Neverinitializeprotectedlocal.git, extractZIPorchange workspace. AllverificationalreadyPASS; no reasonredoV1. DeploymentmustbeactuallyHTTP200verified beforeclaimsitecomplete.

Authorization rechecked after user confirmation: installation168757214 onwudn9922 coverslightweight-drawing-lab; repositorybranchesremainempty. Priorcontents403/blocker ishistorical; actualwrite/deployment retriednext.

## Source publication checkpoint

Source main commit5f87026e5a5983bc6199d4ffb103fd89c2f018a4 successfully published172files. BootstrapREADMEcommit5a123127aed8f19f92677731c9d523d16abb3c7f. Appcontents/workflows rights nowwork. GitHubActions run37580250183: npmci/test136/lint/PagesbuildPASS, configure-pagesFAIL404 (site not enabled), deploymentSKIP. POSTPages still403. Officialactions/configure-pages action.yml saysenablement requiresanother token withadministration:write/pages:write; GITHUB_TOKEN cannotautoenable. No newsecret/PATrequested; user asked toenable SourceGitHubActions viaSettingsPages once. Afterenablement, rootcanrerunActions withcurrentactionswrite scope.
