# ADR-008 — V1 workspace migration and backup
Status: accepted for V1 (2026-10-06).

Keep the existing atlas-terminal IndexedDB symbols/app stores. Database version 2 adds validated workspace fields (defaults, presets, alerts, recent symbols, contextual panel/debug preferences); anchors, symbol-owned indicators and existing locks retain their original values. Upgrade from version 1 validates and writes in the versionchange transaction. A validation failure aborts it, preserving the old database rather than silently clearing records.

Export envelope version 2 includes all symbol settings and workspace models. A legacy version 1 envelope is validated, then upgraded in memory. Unknown versions, malformed ownership/ids/styles/levels and enabled orphan drawing alerts fail before writes. Import replaces app and symbols in one transaction; publication occurs only after completion. Export waits for queued writes and refuses to claim success when persistence failed. Presets are deep copies; application creates fresh instance IDs for each symbol.

Market data is disposable and bounded in a separate atlas-market-cache database with provider/symbol/timeframe/range identity and TTL; it is excluded from settings backup. Stale offline results are explicitly labelled. User settings persistence errors stay visible; cache quota failures never erase settings or hide a successful provider fetch.
