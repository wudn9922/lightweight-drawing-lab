# ADR-013 — Static fundamentals snapshots and Taiwan market support

Status: **Accepted design; local implementation verification complete, publication and remote verification pending** (2026-10-08). The current public Pages deployment remains the previously verified drawing-picker/ATR build until this extension is published and checked. Independent external review and physical-device UAT remain pending.

## Context

GitHub Pages cannot execute the existing Yahoo or SEC Node proxies. The browser must not call SEC directly, invent missing financial values, or silently substitute one provider for another. The same static deployment also needs explicit Taiwan ticker identities, exchange time, currency, and session boundaries without changing the established US profile.

## Decisions

### Normalized SEC snapshots

- Reuse `FinancialNormalizer` and its current fiscal-period derivation, EPS rules, nullable metrics, and raw/derived provenance unchanged.
- Publish a separate normalized financial snapshot schema, version 1. It is not part of the version-4 settings/export grammar and does not alter the IndexedDB settings migration.
- Generate per-symbol JSON packs and a status manifest under `public/financial-data/`. These generated SEC outputs are excluded from Git. The collector filters the mixed market-symbol list to US market profiles, so only the existing 20 US symbols are requested and represented in the SEC manifest; Taiwan symbols are excluded. US-profile issuers or ETFs without supported SEC companyfacts are marked `unsupported`, and any previous valid US pack is retained.
- Fetch through the existing fixed SEC client with a truthful User-Agent. The default identifies this repository; `SEC_USER_AGENT` may override it with the operator's real organization and contact. Browser clients request only same-origin normalized packs.
- In the browser, `FinancialSnapshotProvider` validates every pack and keeps only a bounded, disposable local cache (at most 32 symbols). Packs older than 24 hours are marked stale; valid cached packs may serve offline. Financial facts and this cache are not included in user settings exports.
- Report per-symbol collection outcomes as `fresh`, `retained`, `unavailable`, or `unsupported`. Keep a prior valid snapshot on a symbol-level failure when possible. Never fabricate a value or block price deployment for a partial SEC failure.

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

## Local verification checkpoint

Clean `npm ci`, 218 unit tests across 29 files, lint, normal and Pages builds, and browser regressions pass. Normal browsers: 126 passed / 10 original expected skips / 0 failed. Pages browsers: 32 passed / 0 failed. Combined: 158 passed / 10 original expected skips / 0 failed. The local collector produced 16 US financial packs and 26 market-symbol entries (25 available; 0050.TW is missing 1W/1M). The Taiwan symbol directory has 2,251 entries; the other five selected Taiwan symbols currently have all seven market timeframes. P1-AXIS-06, FIN-01/02, and TW-03/04 are closed. Source publication, hosted HTTPS checks, and live WebKit verification remain pending; no deployment is claimed here.

## Consequences

Pages can serve validated historical SEC snapshots and a bounded Taiwan delayed-price set without a browser-to-SEC request. These are scheduled snapshots, not live feeds. Staleness, offline cache use, missing coverage, SEC unsupported status, and Taiwan's limited symbol set must stay visible. Local regression gates pass; publication and remote verification are still required before claiming deployment. See [the verification checkpoint](../TAIWAN_FINANCIAL_SNAPSHOT_VERIFICATION.md).

## Review limits

Financial normalization remains governed by [ADR-005](ADR-005-fundamentals.md). Market data remains behind the provider interfaces in [ADR-004](ADR-004-market-data.md). This decision adds no paid dependency, new proxy, fabricated financial fallback, broader Taiwan SEC coverage, or V2 scope. Independent Gemini/Claude review and physical-device UAT remain pending.
