# Changelog

All notable changes to `@cobaltintelligence/cli` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
