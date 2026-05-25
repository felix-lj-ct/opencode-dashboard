#!/usr/bin/env node

"use strict";

const http = require("node:http");
const fs = require("node:fs");

const { PORT, HOST, SESSIONS_PER_PAGE, getConfig, setConfig, saveConfig, getLang } = require("./lib/config");
const { findDatabase } = require("./lib/db-locator");
const { loadData, queryMoreSessions } = require("./lib/query");
const { openTerminal } = require("./lib/terminal");
const { buildHTML } = require("./lib/template");
const { openBrowser, killPort } = require("./lib/browser");

// ---------------------------------------------------------------------------
// Empty data structure when DB is not available
// ---------------------------------------------------------------------------
function emptyData() {
  return {
    globalStats: {
      total_sessions: 0, tokens_input: 0, tokens_output: 0, tokens_reasoning: 0,
      tokens_cache_read: 0, tokens_cache_write: 0, cost: 0,
      additions: 0, deletions: 0, files_changed: 0,
    },
    projectStats: [],
    sessionsByDir: {},
  };
}

// ---------------------------------------------------------------------------
// Helper: read JSON body from a request
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const currentConfig = getConfig();
  let dbResult = findDatabase();
  let dbPath = dbResult.path;
  console.log("Terminal:", currentConfig.terminal?.name || currentConfig.terminal?.command || "not configured");

  let data;
  if (dbPath) {
    console.log("Found database:", dbPath, `(${dbResult.source})`);
    console.log("Loading data...");
    data = await loadData(dbPath);
    console.log(`Loaded ${data.projectStats.length} projects, ${data.globalStats.total_sessions} sessions`);
  } else {
    console.log("No database found. Starting with empty data.");
    console.log("Users can configure the database path in Settings.");
    data = emptyData();
  }

  let html = buildHTML(data, dbResult);

  // -----------------------------------------------------------------------
  // HTTP server & API routes
  // -----------------------------------------------------------------------
  const server = http.createServer(async (req, res) => {
    try {
      // GET / — serve dashboard HTML
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      // GET /api/data — raw JSON data
      if (req.method === "GET" && req.url === "/api/data") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }

      // GET /api/sessions?dir=<directory>&offset=<n>&limit=<n>
      if (req.method === "GET" && req.url.startsWith("/api/sessions")) {
        const params = new URL(req.url, `http://${HOST}`).searchParams;
        const dir = params.get("dir");
        const offset = parseInt(params.get("offset") || "0", 10);
        const limit = Math.min(parseInt(params.get("limit") || String(SESSIONS_PER_PAGE), 10), 100);

        if (!dir) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "dir parameter is required" }));
          return;
        }
        if (!dbPath) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Database not available" }));
          return;
        }

        const result = await queryMoreSessions(dbPath, dir, offset, limit);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, html: result.rowsHTML, count: result.count }));
        return;
      }

      // POST /api/open — open terminal in project directory
      if (req.method === "POST" && req.url === "/api/open") {
        const { directory, sessionId } = await readBody(req);
        if (!directory || !fs.existsSync(directory)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Directory not found: " + directory }));
          return;
        }
        const result = openTerminal(directory, sessionId);
        res.writeHead(result.ok ? 200 : 400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /api/config — save terminal + field config
      if (req.method === "POST" && req.url === "/api/config") {
        const { terminal, projectFields, sessionColumns, language } = await readBody(req);
        if (!terminal || !terminal.command) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "terminal.command is required" }));
          return;
        }
        const cfg = getConfig();
        cfg.terminal = terminal;
        if (projectFields) cfg.projectFields = projectFields;
        if (sessionColumns) cfg.sessionColumns = sessionColumns;
        if (language) cfg.language = language;
        setConfig(cfg);
        saveConfig(cfg);
        html = buildHTML(data, dbResult);
        console.log("Config saved:", terminal.name, "| fields:", (projectFields||[]).length, "| columns:", (sessionColumns||[]).length);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // POST /api/dbpath — save database path and reload data
      if (req.method === "POST" && req.url === "/api/dbpath") {
        const { dbPath: newDbPath } = await readBody(req);
        const trimmed = (newDbPath || "").trim();
        const cfg = getConfig();

        if (trimmed) {
          if (!fs.existsSync(trimmed)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: getLang().dbPathInvalid }));
            return;
          }
          cfg.dbPath = trimmed;
        } else {
          delete cfg.dbPath;
        }
        setConfig(cfg);
        saveConfig(cfg);

        // Re-detect and reload
        dbResult = findDatabase();
        dbPath = dbResult.path;
        if (dbPath) {
          const newData = await loadData(dbPath);
          Object.assign(data, newData);
        } else {
          Object.assign(data, emptyData());
        }
        html = buildHTML(data, dbResult);
        console.log("DB path updated:", dbPath || "(not found)", `(${dbResult.source || "none"})`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, dbPath: dbPath || null, source: dbResult.source }));
        return;
      }

      // POST /api/set — save any config fields immediately
      if (req.method === "POST" && req.url === "/api/set") {
        const fields = await readBody(req);
        const cfg = getConfig();
        Object.assign(cfg, fields);
        setConfig(cfg);
        saveConfig(cfg);
        html = buildHTML(data, dbResult);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // POST /api/hide — hide a directory
      if (req.method === "POST" && req.url === "/api/hide") {
        const { directory } = await readBody(req);
        const cfg = getConfig();
        if (!cfg.hiddenDirs) cfg.hiddenDirs = [];
        if (!cfg.hiddenDirs.includes(directory)) {
          cfg.hiddenDirs.push(directory);
          setConfig(cfg);
          saveConfig(cfg);
          html = buildHTML(data, dbResult);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, hiddenDirs: cfg.hiddenDirs }));
        return;
      }

      // POST /api/unhide — unhide a directory
      if (req.method === "POST" && req.url === "/api/unhide") {
        const { directory } = await readBody(req);
        const cfg = getConfig();
        if (cfg.hiddenDirs) {
          cfg.hiddenDirs = cfg.hiddenDirs.filter((d) => d !== directory);
          setConfig(cfg);
          saveConfig(cfg);
          html = buildHTML(data, dbResult);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, hiddenDirs: cfg.hiddenDirs }));
        return;
      }

      // GET /api/refresh — reload data from DB
      if (req.method === "GET" && req.url === "/api/refresh") {
        if (!dbPath) {
          dbResult = findDatabase();
          dbPath = dbResult.path;
        }
        if (!dbPath) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: getLang().dbNotFoundShort }));
          return;
        }
        const newData = await loadData(dbPath);
        Object.assign(data, newData);
        html = buildHTML(data, dbResult);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");

    } catch (err) {
      console.error("Request error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });

  // -----------------------------------------------------------------------
  // Error handling & port recovery
  // -----------------------------------------------------------------------
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${PORT} in use, attempting to take over...`);
      const probe = http.get(`http://${HOST}:${PORT}/`, (res) => {
        res.resume();
        killPort(PORT).then(() => {
          setTimeout(() => server.listen(PORT, HOST), 500);
        });
      });
      probe.on("error", () => {
        killPort(PORT).then(() => {
          setTimeout(() => server.listen(PORT, HOST), 1000);
        });
      });
      probe.setTimeout(2000, () => { probe.destroy(); });
    } else {
      console.error("Server error:", err);
      process.exit(1);
    }
  });

  // -----------------------------------------------------------------------
  // Start server
  // -----------------------------------------------------------------------
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`Dashboard running at ${url}`);
    console.log("Press Ctrl+C to stop");
    openBrowser(url);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
