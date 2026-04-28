# Publishing checklist

This document captures the one-time setup and the per-release steps for publishing `@cobalt-intelligence/cli` to npm.

## One-time setup

### 1. Create the npm scope

If the `@cobalt-intelligence` org doesn't exist on npm yet:

1. Sign in (or create) the org owner npm account at <https://www.npmjs.com/signup>.
2. Create the org: <https://www.npmjs.com/org/create> → name `cobalt-intelligence`.
3. Choose the **free public-package** tier (private packages need a paid plan).
4. Add team members as needed.

### 2. Create a publish token

For local manual publishing (rare):

```bash
npm login --scope=@cobalt-intelligence
```

For CI publishing (preferred):

1. <https://www.npmjs.com/settings/cobalt-intelligence/tokens> → **Generate New Token** → **Granular Access Token**
2. Scope: packages → `@cobalt-intelligence/*` → read+write.
3. Save it to GitHub: repo → Settings → Secrets and variables → Actions → New repo secret → name `NPM_TOKEN`.

### 3. Verify the package looks right

From a clean checkout:

```bash
npm install
npm test
npm pack --dry-run        # lists exactly what will ship to npm
```

You should see `dist/index.js`, `dist/lib/*.js`, `dist/commands/*.js`, `README.md`, `LICENSE`, and `package.json` — and **not** `src/`, `dist/__tests__/`, `*.test.js`, `tsconfig.json`.

Then a real local pack and install:

```bash
npm pack
npm install -g ./cobalt-intelligence-cli-0.1.0.tgz
cobalt --version
cobalt --help
```

## Per-release steps

### Patch / minor / major

Use npm's built-in versioning so the git tag and `package.json` stay in sync:

```bash
git checkout -b release/0.1.1
npm version patch    # or `minor`, or `major`
# ↑ updates package.json + creates a `v0.1.1` git tag locally

git push origin release/0.1.1
# open a PR; once merged to master:

git checkout master
git pull
git push origin v0.1.1   # push the tag — triggers the release workflow
```

The release workflow (`.github/workflows/release.yml`) will:

1. Verify the tag matches `package.json` version
2. Run the full test suite
3. Build
4. Publish to npm with provenance
5. Create a GitHub release with auto-generated notes from the CHANGELOG

### Manual publish (only if CI is broken)

```bash
npm test
npm run build
npm publish --access public
```

`--access public` is required the first time you publish under a scope — npm assumes scoped packages are private otherwise.

## Versioning policy

- **Patch** (`0.1.x`) — bug fixes, documentation, internal refactors, no API change.
- **Minor** (`0.x.0`) — new commands, new flags (additive only).
- **Major** (`x.0.0`) — anything that could break a script: removing a flag, changing default output, changing exit-code semantics, renaming a command.

Pre-1.0 (`0.x`), we may break things in minor versions — but document loudly in CHANGELOG and tag a major bump as soon as the API stabilizes.

## After publishing

- [ ] Verify `npm view @cobalt-intelligence/cli` shows the new version
- [ ] `npx @cobalt-intelligence/cli --version` works
- [ ] Update `documentation.cobaltintelligence.com` with the install one-liner
- [ ] Tweet / announce in #dev-tools
- [ ] Add to the [MCP / dev-tools registry](https://mcp.so) once the MCP server ships
