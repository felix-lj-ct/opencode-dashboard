# AGENTS.md

## Project overview

Node.js application that serves a local web dashboard for browsing OpenCode session history. Published as `@felixli-ct/opencode-dashboard` on npm.

## Architecture

- **Entry point**: `dashboard.js` -- thin HTTP server + API router (~250 lines). All business logic lives in `lib/`.
- Uses only Node.js built-in modules + `sql.js` (WASM SQLite). No framework, no build step, no TypeScript.
- HTML is generated server-side via template literals in `lib/template.js` (`buildHTML()`).
- Config is stored at `~/.config/opencode-dashboard/config.json` (XDG-aware), **not** in the repo root. The repo-root `config.json` is the author's local copy and is excluded from the npm package.

## Module layout (`lib/`)

| Module | Responsibility |
|---|---|
| `lib/config.js` | Constants, i18n dictionaries (en/zh), field definitions, config read/write, mutable config singleton (`getConfig()`/`setConfig()`) |
| `lib/db-locator.js` | Locate `opencode.db` by config path or platform auto-detection |
| `lib/query.js` | Schema introspection, field resolver (SQL expression compiler for schema compatibility), `loadData()`, `queryMoreSessions()` |
| `lib/template.js` | `buildHTML()` -- full HTML page with embedded CSS + client-side JS (~1000 lines) |
| `lib/terminal.js` | `openTerminal()` -- spawn terminal in project directory with `{dir}`/`{cmd}` placeholder replacement |
| `lib/browser.js` | `openBrowser()`, `killPort()` |
| `lib/utils.js` | `escapeHTML()`, `formatNumber()`, `formatRelativeTime()` |

### Dependency flow

```
dashboard.js (entry + router)
  +-- lib/config.js (shared config singleton)
  +-- lib/db-locator.js --> config
  +-- lib/query.js --> config, utils
  +-- lib/template.js --> config, db-locator, utils
  +-- lib/terminal.js --> config
  +-- lib/browser.js
  +-- lib/utils.js (no deps)
```

### Config singleton pattern

`lib/config.js` exports a mutable config object via `getConfig()` / `setConfig(cfg)`. All modules that need config call `getConfig()` at execution time (not at import time) so mutations propagate. When changing config, call `setConfig(cfg)` then `saveConfig(cfg)`.

## Commands

```bash
npm install          # install dependencies
node dashboard.js    # run the dashboard (port 19860, localhost only)
```

There are no tests, no linter, no formatter, no CI, and no build step.

## Key constraints

- CommonJS (`require`), not ESM.
- Node.js >=16.0.0.
- npm is the package manager (`package-lock.json`).
- The shebang `#!/usr/bin/env node` makes `dashboard.js` the npm bin entrypoint.
- The server binds to `127.0.0.1:19860` and opens the browser automatically.
- The SQLite database (`opencode.db`) is opened **read-only**; the dashboard never writes to it.

## API routes

`/` serves the dashboard HTML. JSON API endpoints: `/api/data`, `/api/sessions`, `/api/open`, `/api/config`, `/api/dbpath`, `/api/set`, `/api/hide`, `/api/unhide`, `/api/refresh`.

## Conventions

- i18n: English and Chinese are supported inline in `lib/config.js` (`I18N` object). When adding user-visible strings, add entries in both `en` and `zh`.
- Schema introspection: SQLite column availability is detected at runtime in `lib/query.js` for backward compatibility with older `opencode.db` schemas. Do not assume columns exist; use the field-resolver pattern (`makeFieldResolver`).
- `formatRelativeTime(ms, getLang)` takes a `getLang` function as second argument for i18n support.
- npm package `files` in `package.json` must include `lib/` for the published package to work.
