# Changelog

All notable changes to `@cobaltintelligence/cli` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-04-28

### Fixed
- `cobalt auth login` (interactive, no `--key`) now prints the signup URL, dashboard URL, and docs URL to stderr **before** showing the masked prompt. Previously, a first-time user was staring at "Paste your Cobalt API key:" with no clue where to find one. The hint matches what `cobalt auth setup` and the auth-error onboarding payload already showed.

## [0.3.0] - 2026-04-28

### Added
- **AI-agent onboarding hints.** Auth-related error envelopes (`NO_API_KEY`, `UNAUTHORIZED`) now include a structured `error.details.onboarding` object with `signup_url`, `key_url`, `docs_url`, `support_email`, and a multi-line `human_action` string. AI agents (Claude, Cursor, Cline, Codex, etc.) can read `human_action` verbatim to their human and stop hallucinating signup URLs.
- `cobalt auth setup` — interactive onboarding. Opens the signup page in the user's browser, prompts for the API key (masked), saves it, and confirms. In non-TTY contexts (when an AI agent is driving), it emits a `SETUP_REQUIRED` envelope with the same human-action steps and exits 0 instead of hanging.
- `cobalt auth urls` — prints signup, dashboard, docs, support email, and the human-action hint as a clean JSON envelope. Useful for AI agents that want to surface onboarding info without intentionally triggering an auth error.
- Environment overrides: `COBALT_SIGNUP_URL`, `COBALT_KEY_URL`, `COBALT_DOCS_URL`, `COBALT_SUPPORT_EMAIL` so staging/internal hosts can swap the URLs without a code change.
- 4 new tests covering onboarding hint shape, env overrides, and non-TTY setup behavior (38 tests total).

### Why
The biggest friction point for AI-agent adoption is the moment the agent hits a missing/invalid API key. Without a structured handoff field, the agent has to guess what to tell its human — and often hallucinates URLs. This release gives every agent a single field (`error.details.onboarding.human_action`) it can read out loud verbatim.

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
