# ADR-013 — Static fundamentals snapshots and Taiwan market support

Status: **Accepted design; base source published; bootstrap Pages gate passed, publication and live checks pending** (2026-10-08). Source commit `5a0002769c060fca45a16fe36664994b6013b726` completed successfully through Actions run `37764054644`, but the runner received HTTP 403 from SEC company-ticker resolution, then marked all 20 symbols unavailable after cooldown. The hosted AAPL financial snapshot path returned 404. The local bootstrap seeds and seed-aware cache behavior described below are not claimed deployed. Independent Gemini/Claude review and physical-device UAT remain pending.

## Context

GitHub Pages cannot execute the existing Yahoo or SEC Node proxies. The browser must not call SEC directly, invent missing financial values, or silently substitute one provider for another. The same static deployment also needs explicit Taiwan ticker identities, exchange time, currency, and session boundaries without changing the established US profile.

## Decisions

### Normalized SEC snapshots

- Reuse `FinancialNormalizer` and its current fiscal-period derivation, EPS rules, nullable metrics, and raw/derived provenance unchanged.
- Publish a separate normalized financial snapshot schema, version 1. It is not part of the version-4 settings/export grammar and does not alter the IndexedDB settings migration.
- Generate per-symbol JSON packs and a status manifest under `public/financial-data/`. Generated SEC outputs are excluded from Git. The normalized packs in `data/financial-snapshots/` are intentional, versioned public facts used to bootstrap the Actions cache. The collector validates each seed and uses it only when the matching cache entry is missing or invalid, or when the seed's `fetchedAt` is strictly newer. Preserve `fetchedAt`, `generatedAt`, null metrics, and raw/derived audit metadata; never replace a newer valid cache with an older seed. Filter the mixed market-symbol list to the existing 20 US profiles; Taiwan symbols stay out of SEC requests and the manifest. US-profile issuers or ETFs without supported companyfacts are `unsupported`.
- Fetch through the existing fixed SEC client with a truthful project-identifying User-Agent. Do not rotate User-Agents or IPs or add a proxy workaround for the observed SEC 403. The completed hosted run returned 403 from company-ticker resolution; subsequent requests hit cooldown, all 20 symbols were unavailable, and the hosted AAPL financial path returned 404. A green workflow is not proof that a snapshot was published. Browser clients request only same-origin normalized packs.
- In the browser, `FinancialSnapshotProvider` validates every pack and keeps only a bounded, disposable local cache (at most 32 symbols). Packs older than 24 hours are marked stale; a refresh is attempted, and a failed refresh retains the last valid pack. Valid cached packs may serve offline. Financial facts and this cache are not included in user settings exports.
- Report per-symbol collection outcomes as `fresh`, `retained`, `unavailable`, or `unsupported`. Keep a prior valid snapshot on a symbol-level failure when possible. Isolate seed-write failures per issuer so later issuers continue; the `EISDIR` plus SEC-403 continuation case was exercised. A local mocked-403 run left all 16 seeded packs `fresh`, left NVO/QQQ/SPY/TSM unavailable, made four SEC calls, and preserved seed timestamps exactly. This is mocked local evidence, not live SEC access. Never fabricate a value or block price deployment for a partial SEC failure.
- The 16 bootstrap packs cover AAPL, MSFT, NVDA, TSLA, AMD, META, GOOGL, AMZN, SMCI, NFLX, JPM, WMT, XOM, AVGO, PLTR, and MU. Four remaining allowlist entries may remain unavailable. XOM is identified by current CIK `0002115436`; the available seed contains two quarterly facts and zero annual facts, which must remain explicit.

### Taiwan symbols and market profile

- Keep the existing 20 US symbols and add the verified Taiwan market set: `2330.TW`, `0050.TW`, `2317.TW`, `2454.TW`, `6488.TWO`, and `8069.TWO`.
- Commit `public/symbols/taiwan.json` as a validated fallback sourced from official TWSE/TPEx issuer and fund directories. Optional scheduled refresh is atomic and must preserve the committed fallback on network or validation failure.
- Resolve a bare numeric code only through the official directory and only when it identifies one listing. Require `.TW` or `.TWO` when the code is ambiguous. Preserve explicit exchange suffixes in the canonical symbol.
- Taiwan uses TWD, `Asia/Taipei`, and the 09:00–13:30 local regular session. Existing timezone-aware bar/closed-period behavior uses these profile boundaries. Do not fabricate holiday closures; retain the established US behavior.
- Yahoo's actual Taiwan terminal-auction sample at exactly 13:30 may appear as a flat OHLC, zero-volume close observation. Normalize and mark it explicitly in `sessionCloseObservations`; do not disguise it as an ordinary interval or fabricate it when absent. Research may include it only when the sample is validated and the requested `asOf` is at or after its timestamp, as a `CLOSED INSTANT` sample. Taiwan intraday bar counts can therefore include an additional marked close observation; US calendars and counts remain unchanged.
- Taiwan SEC financials are unsupported. Do not map Taiwan issuers to SEC identities or create a TSM ADR alias. A normal Yahoo backend may look up other explicit Taiwan symbols, while static coverage remains limited to the six snapshots.

### Pages collection and cache lifecycle

- Preserve the existing hourly weekday market refresh. Its Actions cache namespace advances to `atlas-market-profile-v4-` so incompatible prior profile packs are not reused.
- Add a separate `atlas-financial-v1-` Actions cache for `public/financial-data/`, restored and saved with the workflow's always-run cache save behavior.
- Run `node scripts/refresh-fundamentals.mjs` before the Pages build. Run the optional `node scripts/refresh-symbols.mjs` refresh while keeping the committed directory as the deployment fallback.
- SEC summary/status is collector controlled. A partial symbol error must not fail the deployment; a whole collector/infrastructure failure remains visible as a workflow failure rather than producing invented data.
- Keep database and settings/export version 4 unchanged. The financial snapshot and Taiwan directory schemas remain separate public-data contracts.

### Price-axis width and font

Use `Atlas Narrow Axis`, a 70%-horizontal-scale derivative of Barlow Condensed Regular licensed under SIL Open Font License 1.1 ([license](../../src/assets/fonts/OFL.txt)). Scale both glyph advances and outlines; scaling advances alone makes the glyphs overlap. This is a chart-layout font: Lightweight Charts' shared layout family also affects time-axis dates. Company UI fonts remain unchanged.

The price axis uses `minimumWidth: 0`, 11px labels, and `minMove: 0.01`. Only redundant trailing zeroes are trimmed; prices are not rounded to coarser precision, abbreviated, hidden, or cropped. Do not use 8px labels. For ordinary samples, the new native axis width must be no more than 70% of the unchanged accepted old native width. Long values, including one million, may expand naturally while retaining every digit.

The selected font is preloaded and `main` waits for it for up to five seconds before rendering; timeout or load failure falls back to the system font so startup can continue. The bundled font asset participates in the hashed build assets and existing service-worker asset cache. The width reduction is not guaranteed when that asset fails to load.

Primary accepted P1-AXIS-06 is closed. The corrected font scales glyph advances and outlines; its SHA-256 is `5e465e809833ef0fa73c5a65827e921c0e02aba1facc263d606838c1bd126d1f`. Sol independently reviewed all 694 glyph geometries and passed them. The corrected integrated axis check passed all four profiles in 16.5 seconds, and a fresh read-only measurement showed at least 30.8% width reduction for ordinary samples across those profiles. Root inspected the corrected iPhone 13 raster and confirmed the numeric glyphs are separated. The prior overlapping-font measurements and initial 4/4 check are superseded.

## Verification checkpoint

The latest completed local baseline is 225 unit tests across 29 files PASS; lint and typecheck PASS; normal and Pages builds PASS with application JavaScript unchanged; targeted collector/provider unit suite 18 PASS; normal browser run 126 passed / 10 original expected skips / 0 failed. The fresh Pages browser rerun passed 32/32 with 0 failures in 3.3 minutes (exit 0; `/tmp/atlas-sec-bootstrap-pages-browser.log`). Source review covered 269 files and passed. The four-profile axis check and corrected font measurement remain passed, with at least 30.8% width reduction for ordinary samples. The Taiwan directory has 2,251 entries; five selected symbols have all seven timeframes and `0050.TW` remains unavailable for 1W/1M.

The local bootstrap set has 16 normalized US packs; the other four allowlist entries are allowed to remain unavailable. The hosted Actions run deployed the base source, but its SEC collection did not publish AAPL or any other SEC pack because company-ticker resolution received 403 and cooldown left all symbols unavailable. The actual AAPL financial path returned 404. BOOT-01 and BOOT-02 are accepted and closed. The bootstrap now passes the fresh Pages gate. Next: publish non-force, verify an actual hosted pack over HTTPS, and run WebKit. No bootstrap deployment or live SEC verification is claimed.

## Consequences

Pages can serve validated historical SEC snapshots and a bounded Taiwan delayed-price set without a browser-to-SEC request. These are scheduled snapshots, not live feeds. Staleness, offline cache use, missing coverage, SEC unsupported status, and Taiwan's limited symbol set must stay visible. The first hosted collection's SEC 403/cooldown produced no SEC packs; bootstrap facts and seed-aware cache handling now pass local gates and await publication and live checks. See [the verification checkpoint](../TAIWAN_FINANCIAL_SNAPSHOT_VERIFICATION.md).

## Review limits

Financial normalization remains governed by [ADR-005](ADR-005-fundamentals.md). Market data remains behind the provider interfaces in [ADR-004](ADR-004-market-data.md). This decision adds no paid dependency, new proxy, fabricated financial fallback, broader Taiwan SEC coverage, or V2 scope. Independent Gemini/Claude review and physical-device UAT remain pending.
