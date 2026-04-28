# Changelog

All notable changes to `@cobaltintelligence/cli` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-28

### Added
- `cobalt sos pending` — list retryIds the CLI has saved on disk but not yet completed.
- `cobalt sos pending clear <retryId>` — forget a saved retryId.
- Retry-ID recovery: every retryId returned by `/v1/search` is now persisted to `~/.config/cobalt-cli-nodejs/pending/<retryId>.json` *before* polling begins. If the CLI process crashes, times out, or is interrupted (`Ctrl+C`), the retryId is preserved so the user can recover the search they already paid a credit for.
- `retryId` is now included as a structured field on `TIMEOUT` error envelopes (`error.details.retryId`).
- SIGINT handler surfaces the retryId on Ctrl+C with a copy-paste recover command.

### Changed
- `--async` mode now also persists the retryId to disk and includes the saved file path in `meta.pendingFile`.
- 5 new tests covering retryId persistence, recovery, listing, and clearing (now 34 tests total).

### Why
A previously-issued retryId was the user's only way to retrieve a search they had already been billed for. If the CLI process died mid-poll the retryId vanished and the credit was lost. This release makes recovery the default behavior, no flags required.

## [0.1.0] - 2026-04-28

### Added
- Initial public release.
- `cobalt auth` (login / logout / status) with API key stored under user config or `COBALT_API_KEY`.
- `cobalt config` (get / set / unset / path).
- `cobalt sos search | get | retry` against `/v1/search`, with auto-polling for slow states, `--async`, address filters, screenshot, UCC, related-businesses, callbacks, and `--test` dummy mode.
- `cobalt ofac search` against `/ofac`.
- `cobalt tin verify` against `/tinVerification`.
- `cobalt full-verification start | status | wait` (alias `fv`) against `/fullVerification`.
- Standard `{ data, meta, error }` JSON envelope on every command.
- Stable exit codes (`2` not_found, `3` rate_limited, `4` auth, `5` bad_request, `6` timeout, `7` network, `8` server).
- 29 unit + integration tests covering envelope, error mapping, polling, and end-to-end CLI behavior with an in-process fake API server.
