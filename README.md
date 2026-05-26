# OpenCode Dashboard

Local web dashboard for browsing OpenCode session history across all your projects.

![Dashboard overview](https://raw.githubusercontent.com/felix-lj-ct/opencode-dashboard/main/docs/images/dashboard.png)

## Features

- Browse all projects with session counts, token usage, and code change stats
- Expand any project to see its recent sessions (title, agent, model, tokens, changes)
- Click **Open** to launch a terminal with `opencode` in that project directory
- Global stats overview (total sessions, tokens, lines added/deleted, files changed)
- Customizable project card fields and session table columns
- Cross-platform: Windows, macOS, Linux

## Requirements

- Node.js (you already have it if you're using OpenCode)

## Quick Start

Install globally via npm:

```bash
npm install -g @felixli-ct/opencode-dashboard@latest
```

Then run:

```bash
opencode-dashboard
```

Or run from source:

```bash
cd opencode-dashboard
npm install
node dashboard.js
```

The dashboard will auto-open in your browser at `http://127.0.0.1:19860`.

Press `Ctrl+C` to stop.

## Configuration

Open **Settings** (top-right) to customize the dashboard.

### Terminal

Pick a preset or define a custom terminal command. `{dir}` is replaced with the
project directory when you click **Open** on a project card.

![Terminal picker](https://raw.githubusercontent.com/felix-lj-ct/opencode-dashboard/main/docs/images/terminal-picker.png)

Presets include Windows Terminal (fish / PowerShell / CMD), bare PowerShell,
and CMD. On macOS/Linux you can supply your own command (e.g. `alacritty`,
`wezterm`, `kitty`, `gnome-terminal`).

### Card & table columns

Choose exactly which stats appear on each project card and which columns show
up in the per-project session table.

![Customize project card fields and session table columns](https://raw.githubusercontent.com/felix-lj-ct/opencode-dashboard/main/docs/images/customize-fields.png)

## How It Works

1. Locates your `opencode.db` SQLite database automatically
2. Reads session and project data using [sql.js](https://github.com/sql-js/sql.js) (WASM-based, no native compilation needed)
3. Serves a self-contained HTML dashboard via Node's built-in HTTP server
4. The "Open" button spawns a terminal in the selected project directory and runs `opencode`

## Database Locations

The tool auto-detects `opencode.db` in this order:

| Platform | Path |
|----------|------|
| Linux    | `$XDG_DATA_HOME/opencode/opencode.db` or `~/.local/share/opencode/opencode.db` |
| macOS    | `~/.local/share/opencode/opencode.db` or `~/Library/Application Support/opencode/opencode.db` |
| Windows  | `%USERPROFILE%\.local\share\opencode\opencode.db` |

## Security

- HTTP server binds to `127.0.0.1` only (localhost, not accessible from the network)
- Database is opened in read-only mode
- No data leaves your machine

## License

MIT
