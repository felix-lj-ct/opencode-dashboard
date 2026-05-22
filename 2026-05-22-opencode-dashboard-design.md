# OpenCode Dashboard

Local web-based dashboard for browsing OpenCode session history across projects.

## Goal

A single-file Node.js tool that reads the local `opencode.db` SQLite database,
renders a dashboard in the browser, and lets users click to open a terminal in
any project directory with `opencode` running.

## Architecture

Single Node.js file (`dashboard.js`) containing:
- SQLite reader via `sql.js` (WASM, pure JS, no native compilation)
- HTTP server via built-in `node:http`
- All HTML/CSS/JS inlined as template strings
- Terminal launcher via `node:child_process`

```
node dashboard.js
  → locate opencode.db
  → read SQLite via sql.js
  → start http://127.0.0.1:19860
  → auto-open browser
```

## Database Location (cross-platform)

Detection order:
1. `$XDG_DATA_HOME/opencode/opencode.db`
2. `~/.local/share/opencode/opencode.db` (Linux, Windows)
3. `~/Library/Application Support/opencode/opencode.db` (macOS)

Fail with a clear error if none found.

## Database Schema Used

### project table
| Column     | Use                          |
|------------|------------------------------|
| id         | Join key for sessions        |
| worktree   | Project directory path       |
| name       | Project display name (nullable) |

### session table
| Column            | Use                            |
|-------------------|--------------------------------|
| id                | Session identifier             |
| project_id        | FK to project                  |
| directory         | Working directory              |
| title             | Session title                  |
| agent             | Agent type (build, plan, etc.) |
| model             | JSON: {id, providerID}         |
| cost              | USD cost                       |
| tokens_input      | Input token count              |
| tokens_output     | Output token count             |
| tokens_reasoning  | Reasoning token count          |
| tokens_cache_read | Cache read tokens              |
| tokens_cache_write| Cache write tokens             |
| summary_additions | Lines added                    |
| summary_deletions | Lines deleted                  |
| summary_files     | Files changed                  |
| time_created      | Unix ms timestamp              |
| time_updated      | Unix ms timestamp              |

## Dashboard Layout

### Global Stats Bar (top)
- Total sessions count
- Total tokens (input + output + reasoning)
- Total code changes (+additions / -deletions)
- Total files changed

### Project Cards (main area)
Each project card shows:
- Project path (folder name highlighted, full path subtle)
- Session count
- Last used (relative time, e.g. "2 hours ago")
- Token usage subtotal
- Code change subtotal
- **[Open] button** → launches terminal with opencode

Click a card to expand its recent sessions.

### Session List (expanded under project card)
Each session row shows:
- Title
- Agent type badge (build/plan/explore/etc.)
- Model name (parsed from JSON)
- Time (relative)
- Tokens (in/out)
- Code changes (+N / -N)

## API Endpoints

All bound to `127.0.0.1` only (no external access).

| Method | Path        | Description                       |
|--------|-------------|-----------------------------------|
| GET    | /           | Serve the dashboard HTML          |
| GET    | /api/data   | Return all dashboard data as JSON |
| POST   | /api/open   | Open terminal in given directory   |

### POST /api/open
Request body: `{ "directory": "/path/to/project" }`

Platform-specific terminal commands:
- **Windows**: `start cmd /k "cd /d <dir> && opencode"`
- **macOS**: `osascript -e 'tell app "Terminal" to do script "cd <dir> && opencode"'`
- **Linux**: Try `x-terminal-emulator -e`, `gnome-terminal --`, `konsole -e`
  in order; fall back to printing the command if none found.

## File Structure

```
opencode-dashboard/
├── package.json       # { name, version, bin, dependencies: {"sql.js": "^1.x"} }
├── dashboard.js       # Single entry point with everything inlined
└── README.md          # Usage instructions
```

### package.json
```json
{
  "name": "opencode-dashboard",
  "version": "0.1.0",
  "bin": { "opencode-dashboard": "./dashboard.js" },
  "dependencies": { "sql.js": "^1.11.0" }
}
```

## Usage

```bash
# Local use
cd opencode-dashboard
npm install
node dashboard.js

# Future: after npm publish
npx opencode-dashboard
```

## Security

- HTTP server binds only to `127.0.0.1`
- `/api/open` validates that the directory exists before executing
- No data leaves the machine
- Database opened in read-only mode

## Non-goals (v1)

- Session content viewing (message text)
- Session deletion or modification
- Multi-user or remote access
- Custom themes or configuration
