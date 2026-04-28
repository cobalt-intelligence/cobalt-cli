# Examples

These illustrate common workflows. They assume `COBALT_API_KEY` is set or you've run `cobalt auth login`.

## Pipe SOS search results into individual fetches

```bash
cobalt sos search "Acme" --state UT --format json \
  | jq -r '.data.results[].sosId' \
  | while read id; do
      cobalt sos get "$id" --state UT --format json
    done
```

## Use dummy data while integrating (no billing)

```bash
cobalt sos search "Anything" --state UT --test complete
```

## Async SOS workflow for slow states

```bash
RETRY_ID=$(cobalt sos search "Slow Co" --state CA --async \
  | jq -r '.data.retryId')

# Later — minutes or hours — resume:
cobalt sos retry "$RETRY_ID"
```

## OFAC bulk screen from a CSV

```bash
tail -n +2 names.csv | while IFS=, read name; do
  cobalt ofac search "$name" --score 95 --format json \
    | jq --arg n "$name" '{name: $n, matchCount: .data.matchCount}'
done
```

## Driving the CLI from Claude / an agent

Give the agent shell access and a brief like:

> Use the `cobalt` CLI. All commands accept `--format json`. Search Utah for "Acme Holdings"; if multiple matches, fetch full details for each by `sosId`.

The agent will pipe outputs through `jq` and exit codes naturally.
