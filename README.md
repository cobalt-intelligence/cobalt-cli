# cobalt-cli

The official command-line interface for the [Cobalt Intelligence API](https://cobaltintelligence.com).

Search Secretaries of State across all 50 states + DC, screen against OFAC and global sanctions lists, verify TINs, and run full 50-state business verifications — all from your terminal, in pipelines, or from AI agents.

```bash
# search a business
cobalt sos search "Acme Holdings" --state UT

# resume a long-running lookup
cobalt sos search "Slow State Co" --state CA --async   # returns retryId
cobalt sos retry <retryId>

# OFAC screen
cobalt ofac search "Some Person" --type person --score 95

# verify a TIN
cobalt tin verify --tin 123456789 --name "Acme Holdings LLC"

# fire a 50-state verification
cobalt full-verification start --business-name "Acme Holdings"
cobalt full-verification wait <searchGuid>
```

## Why a CLI?

- **AI-native**: every command emits a JSON envelope on stdout — drop it into Claude, Cursor, OpenAI Codex, or any agent that can run shell commands and you have an instant business-data tool.
- **Pipeable**: `cobalt sos search "Acme" --state UT | jq '.data.results[].sosId' | xargs -I{} cobalt sos get {} --state UT`.
- **Stable exit codes**: scripts can branch on `RATE_LIMITED` (3) vs `NOT_FOUND` (2) vs `UNAUTHORIZED` (4) without parsing.
- **Same surface as the API**: every documented parameter is exposed as a flag.

## Install

```bash
npm install -g @cobalt-intelligence/cli
# or run on demand:
npx @cobalt-intelligence/cli sos search "Acme" --state UT
```

Requires Node.js 18+.

## Authentication

Get your API key from the [Cobalt dashboard](https://cobaltintelligence.com), then either:

```bash
cobalt auth login            # interactive prompt, stored under your OS user config
# or
export COBALT_API_KEY="ci_..."   # env var wins; ideal for CI / agents
```

Verify:

```bash
cobalt auth status
```

## Command reference

### `cobalt sos` — Secretary of State

| Command | Description |
|---|---|
| `cobalt sos search <query> --state <st>` | Search by business name. Add `--first-name`/`--last-name` to search by person, or `--sos-id` for direct lookup. |
| `cobalt sos get <sosId> --state <st>` | Direct entity-id fetch. |
| `cobalt sos retry <retryId>` | Resume a previously-started long-running lookup. |

Useful flags: `--cached` (use cached not live), `--screenshot`, `--ucc`, `--related`, `--street/--city/--zip` (AND-filter), `--test complete` (dummy data, no charge), `--callback-url`, `--async` (don't poll, return retryId).

### `cobalt ofac` — Sanctions screening

```bash
cobalt ofac search "Cuban Citrus Co" --type organization --sources SDN,NONSDN --score 95
```

### `cobalt tin` — TIN verification

```bash
cobalt tin verify --tin 123456789 --name "Acme Holdings LLC"
```

### `cobalt full-verification` (alias `cobalt fv`) — 50-state run

```bash
cobalt fv start --business-name "Acme Holdings" --callback-url https://example.com/hook
cobalt fv status <searchGuid>
cobalt fv wait <searchGuid>     # auto-poll until done
```

### `cobalt auth` / `cobalt config`

```bash
cobalt auth login | logout | status
cobalt config get | set <k> <v> | unset <k> | path
```

## Output format

Every command prints this envelope on stdout:

```json
{
  "data": { ... },
  "meta": { "state": "UT" },
  "error": null
}
```

On error:

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "RATE_LIMITED",
    "message": "You have exceeded your rate limit.",
    "retry_after_seconds": 30
  }
}
```

When stdout is a TTY, the CLI pretty-prints `data` and sends `meta` to stderr. In pipelines (non-TTY) or with `--format json`, the full envelope is emitted as machine-readable JSON.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Unknown error |
| 2 | Not found |
| 3 | Rate limited (`RATE_LIMITED`) |
| 4 | Auth problem (`NO_API_KEY` / `UNAUTHORIZED`) |
| 5 | Bad request / validation |
| 6 | Timeout |
| 7 | Network error |
| 8 | Cobalt server error (5xx) |

## Global flags

```
-f, --format <json|pretty|table>   default: pretty in TTY, json in pipes
-q, --quiet                        suppress non-data output
-v, --verbose                      log each request to stderr
    --api-key <key>                override stored / env API key
    --endpoint <url>               override base URL (staging, local)
    --timeout <ms>                 request timeout, default 120000
```

## AI-agent usage

The CLI is designed to be a first-class tool for autonomous coding agents and shell-using LLMs. Best practices:

1. Always call with `--format json` so output is parseable.
2. Use exit codes to branch — `RATE_LIMITED` and `TIMEOUT` are retryable; `BAD_REQUEST` and `NOT_FOUND` are not.
3. For long-running SOS lookups, use `--async` and store the `retryId`; resume with `cobalt sos retry`.
4. Store the API key in `COBALT_API_KEY` rather than in config files — easier to rotate and scope.

A companion MCP server (`@cobalt-intelligence/mcp-server`) is on the roadmap. Until it ships, exposing this CLI as a tool to your agent is the recommended path.

## Development

```bash
git clone https://github.com/cobalt-intelligence/cobalt-cli
cd cobalt-cli
npm install
npm run build
node dist/index.js --help
```

## License

MIT © Cobalt Intelligence
