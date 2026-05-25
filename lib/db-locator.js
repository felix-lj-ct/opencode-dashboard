"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { getConfig } = require("./config");

// ---------------------------------------------------------------------------
// Locate opencode.db
// ---------------------------------------------------------------------------

/** Returns list of default candidate paths for auto-detection */
function getDbCandidates() {
  const home = os.homedir();
  const candidates = [];
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    candidates.push(path.join(xdgData, "opencode", "opencode.db"));
  }
  candidates.push(path.join(home, ".local", "share", "opencode", "opencode.db"));
  if (process.platform === "darwin") {
    candidates.push(
      path.join(home, "Library", "Application Support", "opencode", "opencode.db")
    );
  }
  return candidates;
}

/**
 * Finds database: config path first, then auto-detect.
 * Returns { path, source } or { path: null, source: null }.
 */
function findDatabase() {
  const currentConfig = getConfig();

  // 1. Check config
  const configuredPath = currentConfig.dbPath;
  if (configuredPath) {
    if (fs.existsSync(configuredPath)) {
      return { path: configuredPath, source: "configured" };
    }
    console.warn("Warning: Configured dbPath not found:", configuredPath);
  }

  // 2. Auto-detect
  const candidates = getDbCandidates();
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return { path: p, source: "auto" };
    }
  }

  // 3. Not found - return null instead of crashing
  console.warn("Warning: Could not find opencode.db");
  console.warn("Searched:");
  candidates.forEach((c) => console.warn("  " + c));
  if (configuredPath) console.warn("  " + configuredPath + " (configured)");
  return { path: null, source: null };
}

module.exports = { getDbCandidates, findDatabase };
