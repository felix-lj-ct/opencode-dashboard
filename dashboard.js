#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { exec, spawn } = require("node:child_process");

const PORT = 19860;
const HOST = "127.0.0.1";

// ---------------------------------------------------------------------------
// 1. Config management
// ---------------------------------------------------------------------------
// Store config in user's data directory (not package install dir)
const CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || (process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support")
    : path.join(os.homedir(), ".config")),
  "opencode-dashboard"
);
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULT_PRESETS = {
  win32: [
    { name: "Windows Terminal (fish)", command: "wt.exe", args: "-p fish -d {dir} -- fish -C opencode" },
    { name: "Windows Terminal (PowerShell)", command: "wt.exe", args: "-p PowerShell -d {dir} -- pwsh -NoExit -Command opencode" },
    { name: "Windows Terminal (CMD)", command: "wt.exe", args: "-d {dir} cmd /k opencode" },
    { name: "PowerShell", command: "pwsh.exe", args: "-NoExit -Command cd '{dir}'; opencode" },
    { name: "CMD", command: "cmd.exe", args: "/k cd /d {dir} && opencode" },
  ],
  darwin: [
    { name: "Terminal.app", command: "osascript", args: "-e 'tell application \"Terminal\" to do script \"cd {dir} && opencode\"'" },
    { name: "iTerm2", command: "osascript", args: "-e 'tell application \"iTerm\" to create window with default profile command \"cd {dir} && opencode\"'" },
    { name: "WezTerm", command: "wezterm", args: "start --cwd {dir} -- opencode" },
  ],
  linux: [
    { name: "Default Terminal", command: "x-terminal-emulator", args: "-e bash -c 'cd {dir} && opencode; exec bash'" },
    { name: "GNOME Terminal", command: "gnome-terminal", args: "-- bash -c 'cd {dir} && opencode; exec bash'" },
    { name: "Konsole", command: "konsole", args: "-e bash -c 'cd {dir} && opencode; exec bash'" },
    { name: "WezTerm", command: "wezterm", args: "start --cwd {dir} -- opencode" },
  ],
};

// All available fields for project summary cards
const PROJECT_FIELDS = [
  { key: "session_count", label: "Sessions", default: true },
  { key: "tokens",        label: "Tokens (in+out)", default: true },
  { key: "tokens_input",  label: "Input Tokens", default: false },
  { key: "tokens_output", label: "Output Tokens", default: false },
  { key: "tokens_reasoning", label: "Reasoning Tokens", default: false },
  { key: "tokens_cache_read", label: "Cache Read", default: false },
  { key: "tokens_cache_write", label: "Cache Write", default: false },
  { key: "cost",          label: "Cost ($)", default: false },
  { key: "changes",       label: "Line Changes (+/-)", default: true },
  { key: "additions",     label: "Lines Added", default: false },
  { key: "deletions",     label: "Lines Deleted", default: false },
  { key: "files_changed", label: "Files Changed", default: false },
  { key: "last_used",     label: "Last Used", default: true },
];

// All available columns for session table
const SESSION_COLUMNS = [
  { key: "title",           label: "Title", default: true },
  { key: "agent",           label: "Agent", default: true },
  { key: "model",           label: "Model", default: true },
  { key: "time_updated",    label: "Time", default: true },
  { key: "tokens",          label: "Tokens (in+out)", default: true },
  { key: "tokens_input",    label: "Input Tokens", default: false },
  { key: "tokens_output",   label: "Output Tokens", default: false },
  { key: "tokens_reasoning",label: "Reasoning Tokens", default: false },
  { key: "cost",            label: "Cost ($)", default: false },
  { key: "changes",         label: "Line Changes (+/-)", default: true },
  { key: "additions",       label: "Lines Added", default: false },
  { key: "deletions",       label: "Lines Deleted", default: false },
  { key: "files_changed",   label: "Files Changed", default: false },
  { key: "time_created",    label: "Created", default: false },
  { key: "version",         label: "OC Version", default: false },
];

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const I18N = {
  en: {
    // Header
    title: "OpenCode Dashboard",
    subtitle: "Local session history viewer",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    settings: "Settings",
    showHidden: "Show hidden",
    // Global stats
    totalSessions: "Total Sessions",
    totalTokens: "Total Tokens",
    cacheRead: "Cache Read",
    linesAdded: "Lines Added",
    linesDeleted: "Lines Deleted",
    filesChanged: "Files Changed",
    // Sort
    sort: "Sort:",
    sortRecent: "Recent",
    sortMostUsed: "Most Used",
    sortTokens: "Tokens",
    sortChanges: "Changes",
    // Project card
    projects: "Projects",
    open: "Open",
    hide: "Hide",
    show: "Show",
    // Session table
    resume: "Resume",
    untitled: "Untitled",
    // Settings modal
    settingsTitle: "Settings",
    language: "Language",
    terminal: "Terminal",
    quickSelect: "Quick Select",
    orCustom: "or custom",
    command: "Command",
    commandHint: "The terminal executable (e.g. wt.exe, pwsh.exe, alacritty.exe)",
    arguments: "Arguments",
    argsHint: "Use {dir} as placeholder for the project directory",
    projectCardFields: "Project Card Fields",
    projectCardFieldsHint: "Choose which stats to show on each project card",
    sessionTableColumns: "Session Table Columns",
    sessionTableColumnsHint: "Choose which columns to show in the session list",
    save: "Save",
    // Field labels
    f_sessions: "Sessions", f_tokens: "Tokens (in+out)", f_input: "Input Tokens",
    f_output: "Output Tokens", f_reasoning: "Reasoning Tokens", f_cacheRead: "Cache Read",
    f_cacheWrite: "Cache Write", f_cost: "Cost ($)", f_changes: "Line Changes (+/-)",
    f_added: "Lines Added", f_deleted: "Lines Deleted", f_files: "Files Changed",
    f_lastUsed: "Last Used", f_title: "Title", f_agent: "Agent", f_model: "Model",
    f_time: "Time", f_created: "Created", f_version: "OC Version",
    // Stat labels (short)
    s_sessions: "sessions", s_tokens: "tokens", s_input: "input", s_output: "output",
    s_reasoning: "reasoning", s_cacheRead: "cache read", s_cacheWrite: "cache write",
    s_cost: "cost", s_lines: "lines", s_added: "added", s_deleted: "deleted",
    s_files: "files", s_lastUsed: "last used",
    // Relative time
    t_months: " months ago", t_d: "d ago", t_h: "h ago", t_m: "m ago", t_now: "just now",
    // Toast
    toastOpening: "Opening",
    toastIn: "in",
    toastResuming: "Resuming session in",
    toastSaved: "Settings saved",
    toastTerminalSet: "Terminal set to",
    notConfigured: "Not configured",
    commandRequired: "Command is required",
    // DB path
    dbPath: "Database Path",
    dbPathHint: "Path to opencode.db. Leave empty to auto-detect. Press Enter to save.",
    dbPathPlaceholder: "e.g. C:\\Users\\you\\.local\\share\\opencode\\opencode.db",
    dbNotFound: "Database not found. Please configure the path to opencode.db in Settings.",
    dbNotFoundShort: "opencode.db not found",
    dbAutoDetected: "Auto-detected",
    dbConfigured: "Configured",
    dbPathSaved: "Database path saved, reloading data...",
    dbPathInvalid: "Database file not found at this path",
    // Pagination
    prevPage: "Prev",
    nextPage: "Next",
  },
  zh: {
    title: "OpenCode 仪表盘",
    subtitle: "本地会话历史查看器",
    refresh: "刷新",
    refreshing: "刷新中...",
    settings: "设置",
    showHidden: "显示隐藏",
    totalSessions: "总会话数",
    totalTokens: "总 Tokens",
    cacheRead: "缓存读取",
    linesAdded: "新增行数",
    linesDeleted: "删除行数",
    filesChanged: "变更文件数",
    sort: "排序:",
    sortRecent: "最近使用",
    sortMostUsed: "最常使用",
    sortTokens: "Token 用量",
    sortChanges: "代码改动",
    projects: "项目",
    open: "打开",
    hide: "隐藏",
    show: "显示",
    resume: "恢复",
    untitled: "无标题",
    settingsTitle: "设置",
    language: "语言",
    terminal: "终端",
    quickSelect: "快速选择",
    orCustom: "或 自定义",
    command: "命令",
    commandHint: "终端程序路径 (如 wt.exe, pwsh.exe, alacritty.exe)",
    arguments: "参数",
    argsHint: "使用 {dir} 作为项目目录占位符",
    projectCardFields: "项目卡片字段",
    projectCardFieldsHint: "选择项目卡片上要展示的统计项",
    sessionTableColumns: "会话表格列",
    sessionTableColumnsHint: "选择会话列表中要展示的列",
    save: "保存",
    f_sessions: "会话数", f_tokens: "Tokens (输入+输出)", f_input: "输入 Tokens",
    f_output: "输出 Tokens", f_reasoning: "推理 Tokens", f_cacheRead: "缓存读取",
    f_cacheWrite: "缓存写入", f_cost: "费用 ($)", f_changes: "行数变更 (+/-)",
    f_added: "新增行数", f_deleted: "删除行数", f_files: "变更文件数",
    f_lastUsed: "最近使用", f_title: "标题", f_agent: "Agent", f_model: "模型",
    f_time: "时间", f_created: "创建时间", f_version: "OC 版本",
    s_sessions: "会话", s_tokens: "tokens", s_input: "输入", s_output: "输出",
    s_reasoning: "推理", s_cacheRead: "缓存读", s_cacheWrite: "缓存写",
    s_cost: "费用", s_lines: "行数", s_added: "新增", s_deleted: "删除",
    s_files: "文件", s_lastUsed: "最近使用",
    t_months: " 个月前", t_d: " 天前", t_h: " 小时前", t_m: " 分钟前", t_now: "刚刚",
    toastOpening: "正在打开",
    toastIn: "于",
    toastResuming: "正在恢复会话于",
    toastSaved: "设置已保存",
    toastTerminalSet: "终端已设置为",
    notConfigured: "未配置",
    commandRequired: "命令不能为空",
    dbPath: "数据库路径",
    dbPathHint: "opencode.db 文件路径，留空则自动查找。按 Enter 保存。",
    dbPathPlaceholder: "例如 C:\\Users\\you\\.local\\share\\opencode\\opencode.db",
    dbNotFound: "未找到数据库文件，请在设置中配置 opencode.db 的路径。",
    dbNotFoundShort: "未找到 opencode.db",
    dbAutoDetected: "自动检测",
    dbConfigured: "手动配置",
    dbPathSaved: "数据库路径已保存，正在重新加载数据...",
    dbPathInvalid: "指定路径未找到数据库文件",
    prevPage: "上一页",
    nextPage: "下一页",
  },
};

// Field key -> i18n label key mapping
const FIELD_LABEL_KEYS = {
  session_count: "f_sessions", tokens: "f_tokens", tokens_input: "f_input",
  tokens_output: "f_output", tokens_reasoning: "f_reasoning",
  tokens_cache_read: "f_cacheRead", tokens_cache_write: "f_cacheWrite",
  cost: "f_cost", changes: "f_changes", additions: "f_added",
  deletions: "f_deleted", files_changed: "f_files", last_used: "f_lastUsed",
  title: "f_title", agent: "f_agent", model: "f_model",
  time_updated: "f_time", time_created: "f_created", version: "f_version",
};
const STAT_LABEL_KEYS = {
  session_count: "s_sessions", tokens: "s_tokens", tokens_input: "s_input",
  tokens_output: "s_output", tokens_reasoning: "s_reasoning",
  tokens_cache_read: "s_cacheRead", tokens_cache_write: "s_cacheWrite",
  cost: "s_cost", changes: "s_lines", additions: "s_added",
  deletions: "s_deleted", files_changed: "s_files", last_used: "s_lastUsed",
};

function getLang() {
  return I18N[currentConfig.language] || I18N.en;
}

function getPresets() {
  return DEFAULT_PRESETS[process.platform] || DEFAULT_PRESETS.linux;
}

function getDefaults(fields) {
  return fields.filter((f) => f.default).map((f) => f.key);
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      if (!cfg.hiddenDirs) cfg.hiddenDirs = [];
      if (!cfg.projectFields) cfg.projectFields = getDefaults(PROJECT_FIELDS);
      if (!cfg.sessionColumns) cfg.sessionColumns = getDefaults(SESSION_COLUMNS);
      if (!cfg.language) cfg.language = "en";
      return cfg;
    }
  } catch {}
  const presets = getPresets();
  return {
    terminal: presets[0],
    hiddenDirs: [],
    projectFields: getDefaults(PROJECT_FIELDS),
    sessionColumns: getDefaults(SESSION_COLUMNS),
    language: "en",
  };
}

function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

let currentConfig = loadConfig();

// ---------------------------------------------------------------------------
// 2. Locate opencode.db
// ---------------------------------------------------------------------------

// Returns list of default candidate paths for auto-detection
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

// Finds database: config path first, then auto-detect. Returns { path, source } or { path: null }
function findDatabase() {
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

// ---------------------------------------------------------------------------
// 3. Read data from SQLite via sql.js
// ---------------------------------------------------------------------------

// Introspect the database schema: return a map of tableName -> Set of column names.
function introspectSchema(db) {
  const schema = {};
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (tables.length === 0) return schema;
  for (const row of tables[0].values) {
    const t = row[0];
    const cols = db.exec(`PRAGMA table_info(${t})`);
    schema[t] = new Set(cols.length > 0 ? cols[0].values.map(v => v[1]) : []);
  }
  return schema;
}

// Build a field resolver bound to a given schema.
//
// FIELD_MAP defines, for each logical field name, a list of candidate
// expressions to try in order. Each candidate has:
//   - requires: array of "table.column" the candidate depends on
//   - per-context expressions:
//       agg_session_scope (s = session row in a GROUP BY s.directory query)
//       per_session_join  (returns a SELECT clause for a CTE keyed by session_id;
//                          the CTE is aliased as `t`)
//       global_scalar     (a scalar subquery for the global-stats SELECT)
//
// When no candidate is satisfied by the current schema, the resolver falls back
// to a constant (typically `0` for numerics, `NULL` for text/identifiers) and
// records the field as "missing" so we can log it once at startup.
function makeFieldResolver(schema) {
  const has = (tableCol) => {
    const [t, c] = tableCol.split(".");
    return schema[t] && schema[t].has(c);
  };

  // assistant-message JSON predicate (used in multiple candidates)
  const assistantWhere = "json_extract(m.data, '$.role') = 'assistant'";

  const FIELD_MAP = {
    // ---- Numeric token/cost fields ----
    tokens_input: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.tokens_input"],
          agg_session_scope: "COALESCE(SUM(s.tokens_input), 0)",
          per_session_select: "s.tokens_input AS tokens_input",
          per_session_from_t: "COALESCE(t.tokens_input, 0)",
          global_scalar: "COALESCE((SELECT SUM(tokens_input) FROM session), 0)",
        },
        {
          requires: ["message.data"],
          // For agg in project stats we rely on the t CTE (sum joined per session)
          agg_session_scope: "COALESCE(SUM(t.tokens_input), 0)",
          per_session_from_t: "COALESCE(t.tokens_input, 0)",
          // CTE source line:
          cte_select: "SUM(json_extract(m.data, '$.tokens.input')) AS tokens_input",
          global_scalar: `COALESCE((SELECT SUM(json_extract(m.data, '$.tokens.input')) FROM message m WHERE ${assistantWhere}), 0)`,
        },
      ],
    },
    tokens_output: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.tokens_output"],
          agg_session_scope: "COALESCE(SUM(s.tokens_output), 0)",
          per_session_select: "s.tokens_output AS tokens_output",
          per_session_from_t: "COALESCE(t.tokens_output, 0)",
          global_scalar: "COALESCE((SELECT SUM(tokens_output) FROM session), 0)",
        },
        {
          requires: ["message.data"],
          agg_session_scope: "COALESCE(SUM(t.tokens_output), 0)",
          per_session_from_t: "COALESCE(t.tokens_output, 0)",
          cte_select: "SUM(json_extract(m.data, '$.tokens.output')) AS tokens_output",
          global_scalar: `COALESCE((SELECT SUM(json_extract(m.data, '$.tokens.output')) FROM message m WHERE ${assistantWhere}), 0)`,
        },
      ],
    },
    tokens_reasoning: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.tokens_reasoning"],
          agg_session_scope: "COALESCE(SUM(s.tokens_reasoning), 0)",
          per_session_select: "s.tokens_reasoning AS tokens_reasoning",
          per_session_from_t: "COALESCE(t.tokens_reasoning, 0)",
          global_scalar: "COALESCE((SELECT SUM(tokens_reasoning) FROM session), 0)",
        },
        {
          requires: ["message.data"],
          agg_session_scope: "COALESCE(SUM(t.tokens_reasoning), 0)",
          per_session_from_t: "COALESCE(t.tokens_reasoning, 0)",
          cte_select: "SUM(json_extract(m.data, '$.tokens.reasoning')) AS tokens_reasoning",
          global_scalar: `COALESCE((SELECT SUM(json_extract(m.data, '$.tokens.reasoning')) FROM message m WHERE ${assistantWhere}), 0)`,
        },
      ],
    },
    tokens_cache_read: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.tokens_cache_read"],
          agg_session_scope: "COALESCE(SUM(s.tokens_cache_read), 0)",
          per_session_from_t: "COALESCE(t.tokens_cache_read, 0)",
          global_scalar: "COALESCE((SELECT SUM(tokens_cache_read) FROM session), 0)",
        },
        {
          requires: ["message.data"],
          agg_session_scope: "COALESCE(SUM(t.tokens_cache_read), 0)",
          per_session_from_t: "COALESCE(t.tokens_cache_read, 0)",
          cte_select: "SUM(json_extract(m.data, '$.tokens.cache.read')) AS tokens_cache_read",
          global_scalar: `COALESCE((SELECT SUM(json_extract(m.data, '$.tokens.cache.read')) FROM message m WHERE ${assistantWhere}), 0)`,
        },
      ],
    },
    tokens_cache_write: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.tokens_cache_write"],
          agg_session_scope: "COALESCE(SUM(s.tokens_cache_write), 0)",
          per_session_from_t: "COALESCE(t.tokens_cache_write, 0)",
          global_scalar: "COALESCE((SELECT SUM(tokens_cache_write) FROM session), 0)",
        },
        {
          requires: ["message.data"],
          agg_session_scope: "COALESCE(SUM(t.tokens_cache_write), 0)",
          per_session_from_t: "COALESCE(t.tokens_cache_write, 0)",
          cte_select: "SUM(json_extract(m.data, '$.tokens.cache.write')) AS tokens_cache_write",
          global_scalar: `COALESCE((SELECT SUM(json_extract(m.data, '$.tokens.cache.write')) FROM message m WHERE ${assistantWhere}), 0)`,
        },
      ],
    },
    cost: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.cost"],
          agg_session_scope: "COALESCE(SUM(s.cost), 0)",
          per_session_select: "s.cost AS cost",
          per_session_from_t: "COALESCE(t.cost, 0)",
          global_scalar: "COALESCE((SELECT SUM(cost) FROM session), 0)",
        },
        {
          requires: ["message.data"],
          agg_session_scope: "COALESCE(SUM(t.cost), 0)",
          per_session_from_t: "COALESCE(t.cost, 0)",
          cte_select: "SUM(json_extract(m.data, '$.cost')) AS cost",
          global_scalar: `COALESCE((SELECT SUM(json_extract(m.data, '$.cost')) FROM message m WHERE ${assistantWhere}), 0)`,
        },
      ],
    },

    // ---- Summary line-change fields ----
    additions: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.summary_additions"],
          agg_session_scope: "COALESCE(SUM(s.summary_additions), 0)",
          per_session_select: "s.summary_additions AS summary_additions",
          global_scalar: "COALESCE((SELECT SUM(summary_additions) FROM session), 0)",
        },
      ],
    },
    deletions: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.summary_deletions"],
          agg_session_scope: "COALESCE(SUM(s.summary_deletions), 0)",
          per_session_select: "s.summary_deletions AS summary_deletions",
          global_scalar: "COALESCE((SELECT SUM(summary_deletions) FROM session), 0)",
        },
      ],
    },
    files_changed: {
      fallback: "0",
      candidates: [
        {
          requires: ["session.summary_files"],
          agg_session_scope: "COALESCE(SUM(s.summary_files), 0)",
          per_session_select: "s.summary_files AS summary_files",
          global_scalar: "COALESCE((SELECT SUM(summary_files) FROM session), 0)",
        },
      ],
    },

    // ---- Per-session text fields (only used in per-session SELECT) ----
    agent: {
      fallback: "NULL",
      candidates: [
        {
          requires: ["session.agent"],
          per_session_select: "s.agent AS agent",
        },
        {
          requires: ["message.data"],
          per_session_from_t: "t.agent",
          cte_select: "json_extract(m.data, '$.agent') AS agent",
        },
      ],
    },
    model: {
      fallback: "NULL",
      candidates: [
        {
          requires: ["session.model"],
          per_session_select: "s.model AS model",
        },
        {
          requires: ["message.data"],
          per_session_from_t: "t.model",
          // Compose "providerID/modelID". The modelID field has historically been
          // either a plain string or a JSON object {id, providerID, variant}.
          // COALESCE drains to the right form when json_extract returns NULL for
          // the non-matching shape.
          cte_select:
            "(COALESCE(json_extract(m.data, '$.providerID'), json_extract(m.data, '$.modelID.providerID')) " +
            "|| '/' || " +
            "COALESCE(json_extract(m.data, '$.modelID.id'), json_extract(m.data, '$.modelID'))) AS model",
        },
      ],
    },
  };

  const missing = [];
  const resolved = {}; // fieldName -> { candidate, fallback } | { fallback }

  for (const [name, def] of Object.entries(FIELD_MAP)) {
    const pick = def.candidates.find(c => c.requires.every(has));
    if (pick) {
      resolved[name] = { candidate: pick, fallback: def.fallback };
    } else {
      resolved[name] = { candidate: null, fallback: def.fallback };
      missing.push(name);
    }
  }

  // Whether any field needs the per-session message CTE (`t`)
  const needsMessageCTE = Object.values(resolved).some(r => {
    if (!r.candidate) return false;
    return r.candidate.requires.includes("message.data") &&
      (r.candidate.cte_select || r.candidate.per_session_from_t);
  });

  // Build the CTE body (only for fields whose chosen candidate is the message
  // JSON one). Always includes session_id key.
  let cteBody = null;
  if (needsMessageCTE) {
    const cteLines = ["session_id"];
    for (const [name, r] of Object.entries(resolved)) {
      if (r.candidate && r.candidate.requires.includes("message.data") && r.candidate.cte_select) {
        cteLines.push(r.candidate.cte_select);
      }
    }
    cteBody = `
      SELECT
        ${cteLines.join(",\n        ")}
      FROM message m
      WHERE ${assistantWhere}
      GROUP BY session_id
    `;
  }

  // Helpers used by query builders
  function aggExpr(name) {
    const r = resolved[name];
    if (r.candidate && r.candidate.agg_session_scope) return r.candidate.agg_session_scope;
    return r.fallback;
  }
  function perSessionExpr(name) {
    const r = resolved[name];
    if (!r.candidate) return `${r.fallback} AS ${name}`;
    if (r.candidate.per_session_select) {
      // Already an "expr AS alias" form
      return r.candidate.per_session_select;
    }
    if (r.candidate.per_session_from_t) {
      return `${r.candidate.per_session_from_t} AS ${name}`;
    }
    return `${r.fallback} AS ${name}`;
  }
  function globalScalar(name) {
    const r = resolved[name];
    if (r.candidate && r.candidate.global_scalar) return r.candidate.global_scalar;
    return r.fallback;
  }

  return {
    resolved,
    missing,
    needsMessageCTE,
    cteBody,
    aggExpr,
    perSessionExpr,
    globalScalar,
  };
}

let _missingWarned = false;
function warnMissingOnce(missing) {
  if (_missingWarned || missing.length === 0) return;
  _missingWarned = true;
  console.warn(
    `Note: ${missing.length} field(s) not available in current opencode schema, ` +
    `falling back to 0/NULL: ${missing.join(", ")}`
  );
}

async function loadData(dbPath) {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // 1) Introspect schema, build a field resolver
  const schema = introspectSchema(db);
  const F = makeFieldResolver(schema);
  warnMissingOnce(F.missing);

  // session table must at least have id/directory/time_updated to do anything
  const sessionCols = schema.session || new Set();
  if (!sessionCols.has("id") || !sessionCols.has("directory") || !sessionCols.has("time_updated")) {
    console.error("Session table missing required base columns (id/directory/time_updated). Aborting load.");
    db.close();
    return { globalStats: {}, projectStats: [], sessionsByDir: {} };
  }

  const cteClause = F.needsMessageCTE
    ? `WITH session_tokens AS (${F.cteBody})`
    : "";
  const joinClause = F.needsMessageCTE
    ? "LEFT JOIN session_tokens t ON t.session_id = s.id"
    : "";

  // 2) Project stats (grouped by session.directory)
  const projectStats = [];
  const statsSql = `
    ${cteClause}
    SELECT
      s.directory AS directory,
      COUNT(s.id) AS session_count,
      MAX(s.time_updated) AS last_used,
      ${F.aggExpr("tokens_input")} AS tokens_input,
      ${F.aggExpr("tokens_output")} AS tokens_output,
      ${F.aggExpr("tokens_reasoning")} AS tokens_reasoning,
      ${F.aggExpr("tokens_cache_read")} AS tokens_cache_read,
      ${F.aggExpr("tokens_cache_write")} AS tokens_cache_write,
      ${F.aggExpr("cost")} AS cost,
      ${F.aggExpr("additions")} AS additions,
      ${F.aggExpr("deletions")} AS deletions,
      ${F.aggExpr("files_changed")} AS files_changed
    FROM session s
    ${joinClause}
    WHERE s.directory != ''
    GROUP BY s.directory
    ORDER BY last_used DESC
  `;
  const statsStmt = db.prepare(statsSql);
  while (statsStmt.step()) projectStats.push(statsStmt.getAsObject());
  statsStmt.free();

  // 3) Global stats (scalar subqueries; no need to share the CTE)
  const globalSql = `
    SELECT
      (SELECT COUNT(*) FROM session) AS total_sessions,
      ${F.globalScalar("tokens_input")} AS tokens_input,
      ${F.globalScalar("tokens_output")} AS tokens_output,
      ${F.globalScalar("tokens_reasoning")} AS tokens_reasoning,
      ${F.globalScalar("tokens_cache_read")} AS tokens_cache_read,
      ${F.globalScalar("tokens_cache_write")} AS tokens_cache_write,
      ${F.globalScalar("cost")} AS cost,
      ${F.globalScalar("additions")} AS additions,
      ${F.globalScalar("deletions")} AS deletions,
      ${F.globalScalar("files_changed")} AS files_changed
  `;
  const globalStmt = db.prepare(globalSql);
  globalStmt.step();
  const globalStats = globalStmt.getAsObject();
  globalStmt.free();

  // 4) Sessions per directory
  // version column is optional; include only if it exists
  const versionCol = sessionCols.has("version") ? "s.version" : "NULL AS version";
  const timeCreatedCol = sessionCols.has("time_created") ? "s.time_created" : "NULL AS time_created";
  const titleCol = sessionCols.has("title") ? "s.title" : "NULL AS title";

  const sessSql = `
    ${cteClause}
    SELECT
      s.id, ${titleCol}, s.directory, ${versionCol},
      ${timeCreatedCol}, s.time_updated,
      ${F.perSessionExpr("agent")},
      ${F.perSessionExpr("model")},
      ${F.perSessionExpr("tokens_input")},
      ${F.perSessionExpr("tokens_output")},
      ${F.perSessionExpr("tokens_reasoning")},
      ${F.perSessionExpr("cost")},
      ${F.perSessionExpr("additions")},
      ${F.perSessionExpr("deletions")},
      ${F.perSessionExpr("files_changed")}
    FROM session s
    ${joinClause}
    WHERE s.directory = ?
    ORDER BY s.time_updated DESC LIMIT 20
  `;

  const sessionsByDir = {};
  for (const proj of projectStats) {
    const sessStmt = db.prepare(sessSql);
    sessStmt.bind([proj.directory]);
    const sessions = [];
    while (sessStmt.step()) sessions.push(sessStmt.getAsObject());
    sessStmt.free();
    sessionsByDir[proj.directory] = sessions;
  }

  db.close();
  return { globalStats, projectStats, sessionsByDir };
}

// ---------------------------------------------------------------------------
// 4. Open terminal in a directory
// ---------------------------------------------------------------------------
function openTerminal(directory, sessionId) {
  const terminal = currentConfig.terminal;
  if (!terminal || !terminal.command) {
    console.error("No terminal configured");
    return { ok: false, error: "No terminal configured. Open Settings to configure." };
  }

  // Build the opencode command with optional session ID
  const ocCmd = sessionId ? `opencode -s ${sessionId}` : "opencode";

  // Replace placeholders in args
  // {dir} = project directory, {cmd} = opencode command (with or without -s)
  let args = terminal.args.replace(/\{dir\}/g, directory);

  if (args.includes("{cmd}")) {
    // Explicit {cmd} placeholder — use it directly
    args = args.replace(/\{cmd\}/g, ocCmd);
  } else {
    // No {cmd} placeholder — replace the literal word "opencode" (not "opencode-dashboard" etc.)
    // Wrap in quotes if the command has arguments (for shells like fish -C)
    if (sessionId) {
      // Replace 'opencode' with quoted version to prevent shell from parsing -s as its own flag
      // e.g. fish -C opencode  →  fish -C "opencode -s ses_xxx"
      args = args.replace(/opencode(?![-\w])/, `"${ocCmd}"`);
    }
  }

  const fullCmd = `${terminal.command} ${args}`;
  console.log("Launching:", fullCmd);

  if (process.platform === "win32") {
    exec(`start "" ${fullCmd}`, { shell: "cmd.exe" }, (err) => {
      if (err) console.error("Failed to open terminal:", err.message);
    });
  } else {
    exec(fullCmd, (err) => {
      if (err) console.error("Failed to open terminal:", err.message);
    });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// 5. HTML template
// ---------------------------------------------------------------------------
function buildHTML(data, dbInfo) {
  const { globalStats, projectStats, sessionsByDir } = data;
  const presetsJSON = JSON.stringify(getPresets());
  const configJSON = JSON.stringify(currentConfig);
  const dbInfoJSON = JSON.stringify(dbInfo || { path: null, source: null });
  const L = getLang();
  const hasData = dbInfo && dbInfo.path;

  const hiddenDirs = currentConfig.hiddenDirs || [];
  const pf = currentConfig.projectFields || getDefaults(PROJECT_FIELDS);
  const sc = currentConfig.sessionColumns || getDefaults(SESSION_COLUMNS);

  // Helper: render a project stat field
  function renderProjectStat(key, p) {
    const vals = {
      session_count:     formatNumber(p.session_count),
      tokens:            formatNumber(p.tokens_input + p.tokens_output),
      tokens_input:      formatNumber(p.tokens_input),
      tokens_output:     formatNumber(p.tokens_output),
      tokens_reasoning:  formatNumber(p.tokens_reasoning),
      tokens_cache_read: formatNumber(p.tokens_cache_read),
      tokens_cache_write:formatNumber(p.tokens_cache_write),
      cost:              "$" + (p.cost || 0).toFixed(2),
      changes:           `<span class="additions">+${formatNumber(p.additions)}</span> <span class="deletions">-${formatNumber(p.deletions)}</span>`,
      additions:         `<span class="additions">+${formatNumber(p.additions)}</span>`,
      deletions:         `<span class="deletions">-${formatNumber(p.deletions)}</span>`,
      files_changed:     formatNumber(p.files_changed),
      last_used:         formatRelativeTime(p.last_used),
    };
    const v = vals[key];
    if (v == null) return "";
    const labelKey = STAT_LABEL_KEYS[key];
    const label = labelKey ? L[labelKey] : key;
    return `<div class="stat"><span class="stat-value">${v}</span><span class="stat-label">${label}</span></div>`;
  }

  // Helper: render a session table cell
  function renderSessionCell(key, s) {
    let modelName = "";
    if (s.model) { try { modelName = JSON.parse(s.model).id || ""; } catch {} }
    const defs = {
      title:            `<td class="session-title" title="${escapeHTML(s.title || "")}">${escapeHTML(s.title || L.untitled)}</td>`,
      agent:            `<td><span class="agent-badge agent-${escapeHTML(s.agent || "default")}">${escapeHTML(s.agent || "-")}</span></td>`,
      model:            `<td class="model-name">${escapeHTML(modelName)}</td>`,
      time_updated:     `<td class="time-cell">${formatRelativeTime(s.time_updated)}</td>`,
      tokens:           `<td class="token-cell">${formatNumber(s.tokens_input + s.tokens_output)}</td>`,
      tokens_input:     `<td class="token-cell">${formatNumber(s.tokens_input)}</td>`,
      tokens_output:    `<td class="token-cell">${formatNumber(s.tokens_output)}</td>`,
      tokens_reasoning: `<td class="token-cell">${formatNumber(s.tokens_reasoning || 0)}</td>`,
      cost:             `<td class="token-cell">$${(s.cost || 0).toFixed(4)}</td>`,
      changes:          `<td class="change-cell"><span class="additions">+${formatNumber(s.summary_additions || 0)}</span><span class="deletions">-${formatNumber(s.summary_deletions || 0)}</span></td>`,
      additions:        `<td class="change-cell"><span class="additions">+${formatNumber(s.summary_additions || 0)}</span></td>`,
      deletions:        `<td class="change-cell"><span class="deletions">-${formatNumber(s.summary_deletions || 0)}</span></td>`,
      files_changed:    `<td class="token-cell">${formatNumber(s.summary_files || 0)}</td>`,
      time_created:     `<td class="time-cell">${formatRelativeTime(s.time_created)}</td>`,
      version:          `<td class="time-cell">${escapeHTML(s.version || "-")}</td>`,
    };
    return defs[key] || "<td>-</td>";
  }

  // Session column headers (i18n)
  const sessionHeaderLabels = {};
  SESSION_COLUMNS.forEach((c) => {
    const lk = FIELD_LABEL_KEYS[c.key];
    sessionHeaderLabels[c.key] = lk ? L[lk] : c.label;
  });

  const projectCardsHTML = projectStats
    .map((p, idx) => {
      const dir = p.directory;
      const folderName = path.basename(dir);
      const parentPath = path.dirname(dir);
      const displayName = folderName;
      const cardId = "card-" + idx;
      const isHidden = hiddenDirs.includes(dir);
      const sessions = sessionsByDir[dir] || [];

      const sessionRowsHTML = sessions
        .map((s) => {
          const cells = sc.map((key) => renderSessionCell(key, s)).join("");
          return `
          <tr class="session-row">
            ${cells}
            <td class="action-cell">
              <button class="resume-btn" onclick="event.stopPropagation(); openSession('${escapeHTML(s.directory.replace(/\\/g, "\\\\"))}', '${escapeHTML(s.id)}')" title="${L.resume}">${L.resume}</button>
            </td>
          </tr>`;
        })
        .join("");

      const statsHTML = pf.map((key) => renderProjectStat(key, p)).join("");
      const thHTML = sc.map((key) => `<th>${sessionHeaderLabels[key] || key}</th>`).join("") + "<th></th>";

      const dirEscaped = escapeHTML(dir.replace(/\\/g, "\\\\"));
      return `
      <div class="project-card${isHidden ? " hidden-card" : ""}" data-dir="${escapeHTML(dir)}" data-last-used="${p.last_used || 0}" data-sessions="${p.session_count}" data-tokens="${p.tokens_input + p.tokens_output}" data-changes="${(p.additions || 0) + (p.deletions || 0)}">
        <div class="project-header" onclick="toggleProject('${cardId}')">
          <div class="project-info">
            <div class="project-name">${escapeHTML(displayName)}</div>
            <div class="project-path">${escapeHTML(parentPath)}</div>
          </div>
          ${statsHTML}
          <button class="hide-btn" onclick="event.stopPropagation(); toggleHide('${dirEscaped}', ${isHidden})" title="${isHidden ? L.show : L.hide}">${isHidden ? L.show : L.hide}</button>
          <button class="open-btn" onclick="event.stopPropagation(); openProject('${dirEscaped}')">${L.open}</button>
        </div>
        <div class="project-sessions" id="sessions-${cardId}" style="display:none;">
          <table class="session-table">
            <thead><tr>${thHTML}</tr></thead>
            <tbody>${sessionRowsHTML}</tbody>
          </table>
        </div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenCode Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #0d1117; color: #c9d1d9; min-height: 100vh;
  }
  .header {
    background: #161b22; border-bottom: 1px solid #30363d;
    padding: 20px 32px; display: flex; align-items: center; gap: 16px;
  }
  .header h1 { font-size: 20px; font-weight: 600; color: #f0f6fc; }
  .header .subtitle { font-size: 13px; color: #8b949e; flex: 1; }
  .settings-btn {
    background: #30363d; color: #c9d1d9; border: 1px solid #484f58;
    border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer;
    transition: background 0.2s;
  }
  .settings-btn:hover { background: #484f58; }

  .global-stats {
    display: flex; gap: 24px; padding: 20px 32px;
    background: #161b22; border-bottom: 1px solid #30363d; flex-wrap: wrap;
  }
  .global-stat { display: flex; flex-direction: column; align-items: center; min-width: 120px; }
  .global-stat .value { font-size: 24px; font-weight: 700; color: #f0f6fc; }
  .global-stat .label { font-size: 12px; color: #8b949e; margin-top: 4px; }

  .main { max-width: 100%; margin: 0 auto; padding: 24px 32px; }
  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
  }
  .section-title { font-size: 16px; font-weight: 600; color: #f0f6fc; }
  .sort-controls { display: flex; align-items: center; gap: 8px; }
  .sort-label { font-size: 12px; color: #8b949e; }
  .sort-btn {
    background: none; color: #8b949e; border: 1px solid #30363d;
    border-radius: 4px; padding: 4px 10px; font-size: 12px;
    cursor: pointer; transition: all 0.2s;
  }
  .sort-btn:hover { border-color: #58a6ff; color: #c9d1d9; }
  .sort-btn.active { border-color: #58a6ff; color: #58a6ff; background: rgba(88,166,255,0.1); }

  .project-card {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    margin-bottom: 12px; overflow: hidden; transition: border-color 0.2s;
  }
  .project-card:hover { border-color: #58a6ff; }
  .project-header {
    display: grid; align-items: center; padding: 16px 20px;
    cursor: pointer; gap: 0 16px;
  }
  .project-header:hover { background: #1c2128; }
  .project-info { min-width: 0; grid-column: 1; }
  .project-name {
    font-size: 16px; font-weight: 600; color: #58a6ff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .project-path {
    font-size: 12px; color: #8b949e; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .stat { display: flex; flex-direction: column; align-items: center; justify-self: center; }
  .stat-value { font-size: 14px; font-weight: 600; color: #f0f6fc; }
  .stat-label { font-size: 11px; color: #8b949e; margin-top: 2px; }

  .open-btn {
    background: #238636; color: #fff; border: none; border-radius: 6px;
    padding: 8px 16px; font-size: 13px; font-weight: 600;
    cursor: pointer; white-space: nowrap; transition: background 0.2s;
  }
  .open-btn:hover { background: #2ea043; }
  .open-btn:active { background: #1a7f37; }

  .project-sessions { border-top: 1px solid #30363d; background: #0d1117; }
  .session-table { width: 100%; border-collapse: collapse; }
  .session-table th {
    text-align: left; font-size: 12px; font-weight: 600;
    color: #8b949e; padding: 8px 12px; border-bottom: 1px solid #21262d;
  }
  .session-table td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #21262d; }
  .session-row:hover { background: #161b22; }
  .session-title {
    max-width: 300px; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; color: #c9d1d9;
  }
  .model-name {
    font-size: 12px; color: #8b949e; max-width: 180px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .time-cell { white-space: nowrap; color: #8b949e; font-size: 12px; }
  .token-cell { white-space: nowrap; font-size: 12px; color: #8b949e; }
  .change-cell { white-space: nowrap; font-size: 12px; }
  .additions { color: #3fb950; }
  .deletions { color: #f85149; margin-left: 6px; }

  .agent-badge {
    display: inline-block; padding: 2px 8px; border-radius: 12px;
    font-size: 11px; font-weight: 600; background: #30363d; color: #8b949e;
  }
  .agent-build { background: #1f3d2a; color: #3fb950; }
  .agent-plan { background: #2a1f3d; color: #a371f7; }
  .agent-explore { background: #1f2d3d; color: #58a6ff; }
  .agent-general { background: #3d2a1f; color: #d29922; }

  /* Toast */
  .toast {
    position: fixed; bottom: 24px; right: 24px;
    background: #238636; color: #fff; padding: 12px 20px;
    border-radius: 8px; font-size: 14px; font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    transform: translateY(80px); opacity: 0;
    transition: all 0.3s ease; z-index: 1000;
  }
  .toast.show { transform: translateY(0); opacity: 1; }
  .toast.error { background: #da3633; }

  /* Settings Modal */
  .modal-overlay {
    display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6); z-index: 2000; justify-content: center; align-items: center;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: #161b22; border: 1px solid #30363d; border-radius: 12px;
    width: 560px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .modal-header {
    padding: 20px 24px; border-bottom: 1px solid #30363d;
    display: flex; justify-content: space-between; align-items: center;
  }
  .modal-header h2 { font-size: 18px; color: #f0f6fc; }
  .modal-close {
    background: none; border: none; color: #8b949e; font-size: 20px;
    cursor: pointer; padding: 4px 8px; border-radius: 4px;
  }
  .modal-close:hover { background: #30363d; color: #f0f6fc; }
  .modal-body { padding: 24px; }

  .form-group { margin-bottom: 20px; }
  .form-label {
    display: block; font-size: 13px; font-weight: 600;
    color: #c9d1d9; margin-bottom: 8px;
  }
  .form-hint { font-size: 12px; color: #8b949e; margin-bottom: 8px; }
  .form-input {
    width: 100%; background: #0d1117; border: 1px solid #30363d;
    border-radius: 6px; padding: 8px 12px; font-size: 14px;
    color: #c9d1d9; font-family: monospace;
  }
  .form-input:focus { outline: none; border-color: #58a6ff; }

  .preset-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .preset-item {
    display: flex; align-items: center; gap: 12px;
    background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
    padding: 10px 14px; cursor: pointer; transition: border-color 0.2s;
  }
  .preset-item:hover { border-color: #58a6ff; }
  .preset-item.active { border-color: #238636; background: #0d1117; }
  .preset-item .preset-name { font-size: 14px; font-weight: 600; color: #f0f6fc; }
  .preset-item .preset-cmd { font-size: 12px; color: #8b949e; font-family: monospace; }

  .or-divider {
    text-align: center; color: #484f58; font-size: 12px;
    margin: 16px 0; position: relative;
  }
  .or-divider::before, .or-divider::after {
    content: ''; position: absolute; top: 50%;
    width: 40%; height: 1px; background: #30363d;
  }
  .or-divider::before { left: 0; }
  .or-divider::after { right: 0; }

  .save-btn {
    background: #238636; color: #fff; border: none; border-radius: 6px;
    padding: 10px 20px; font-size: 14px; font-weight: 600;
    cursor: pointer; width: 100%; transition: background 0.2s;
  }
  .save-btn:hover { background: #2ea043; }

  .action-cell { white-space: nowrap; }
  .resume-btn {
    background: #30363d; color: #c9d1d9; border: 1px solid #484f58;
    border-radius: 4px; padding: 3px 10px; font-size: 12px;
    cursor: pointer; transition: all 0.2s;
  }
  .resume-btn:hover { background: #58a6ff; color: #fff; border-color: #58a6ff; }

  .hide-btn {
    background: none; color: #484f58; border: 1px solid transparent;
    border-radius: 4px; padding: 4px 10px; font-size: 12px;
    cursor: pointer; transition: all 0.2s;
  }
  .hide-btn:hover { color: #f85149; border-color: #484f58; }

  .hidden-card { display: none; }
  body.show-hidden .hidden-card {
    display: block; opacity: 0.5;
  }
  body.show-hidden .hidden-card:hover { opacity: 0.8; }
  body.show-hidden .hidden-card .hide-btn { color: #3fb950; }
  body.show-hidden .hidden-card .hide-btn:hover { color: #3fb950; border-color: #3fb950; }

  .lang-picker { display: flex; gap: 8px; margin-top: 8px; }
  .lang-btn {
    background: #0d1117; color: #8b949e; border: 1px solid #30363d;
    border-radius: 6px; padding: 8px 20px; font-size: 14px;
    cursor: pointer; transition: all 0.2s;
  }
  .lang-btn:hover { border-color: #58a6ff; color: #c9d1d9; }
  .lang-btn.active { border-color: #238636; color: #3fb950; background: #0d1117; }

  .settings-section-title {
    font-size: 15px; font-weight: 600; color: #f0f6fc;
    margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #30363d;
  }
  .field-picker {
    display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
  }
  .field-chip {
    display: flex; align-items: center; gap: 6px;
    background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
    padding: 6px 12px; cursor: pointer; transition: all 0.2s;
    font-size: 13px; color: #8b949e; user-select: none;
  }
  .field-chip:hover { border-color: #58a6ff; color: #c9d1d9; }
  .field-chip.active { border-color: #238636; background: #0d1117; color: #3fb950; }
  .field-chip input { display: none; }

  .toggle-hidden-btn {
    background: none; color: #8b949e; border: 1px solid #30363d;
    border-radius: 6px; padding: 4px 12px; font-size: 12px;
    cursor: pointer; transition: all 0.2s;
  }
  .toggle-hidden-btn:hover { border-color: #58a6ff; color: #c9d1d9; }
  .toggle-hidden-btn.active { border-color: #58a6ff; color: #58a6ff; }

  .current-terminal {
    display: inline-flex; align-items: center; gap: 6px;
    background: #30363d; padding: 3px 10px; border-radius: 12px;
    font-size: 12px; color: #c9d1d9;
  }

  .project-header {
    grid-template-columns: minmax(180px, 1.5fr) ${pf.map((key) => {
      const widths = {
        session_count: '55px', tokens: '60px', tokens_input: '60px', tokens_output: '60px',
        tokens_reasoning: '60px', tokens_cache_read: '65px', tokens_cache_write: '65px',
        cost: '72px', changes: '90px', additions: '65px', deletions: '65px',
        files_changed: '50px', last_used: '65px',
      };
      return widths[key] || '60px';
    }).join(" ")} auto auto;
  }

  /* Empty state */
  .empty-state {
    text-align: center; padding: 80px 20px; color: #8b949e;
  }
  .empty-state-icon { font-size: 48px; margin-bottom: 16px; }
  .empty-state-title { font-size: 20px; font-weight: 600; color: #c9d1d9; margin-bottom: 8px; }
  .empty-state-message { font-size: 14px; line-height: 1.6; max-width: 500px; margin: 0 auto; }

  /* DB path settings */
  .db-path-row { margin-top: 8px; }
  .db-path-status { margin-top: 8px; font-size: 12px; word-break: break-all; }
  .db-status-ok { color: #3fb950; }
  .db-status-error { color: #f85149; }

  /* Pagination */
  .pagination {
    display: flex; justify-content: center; align-items: center; gap: 4px;
    margin-top: 20px; padding: 12px 0;
  }
  .page-btn {
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 6px; padding: 6px 12px; font-size: 13px;
    cursor: pointer; transition: all 0.2s; min-width: 36px; text-align: center;
  }
  .page-btn:hover { border-color: #58a6ff; color: #f0f6fc; }
  .page-btn.active { background: #58a6ff; color: #fff; border-color: #58a6ff; }
  .page-btn:disabled { opacity: 0.4; cursor: default; border-color: #30363d; color: #484f58; }
  .page-btn:disabled:hover { border-color: #30363d; color: #484f58; }
  .page-info { color: #8b949e; font-size: 13px; margin: 0 8px; }
  .page-ellipsis { color: #484f58; font-size: 13px; padding: 6px 4px; }

  @media (max-width: 768px) {
    .project-header { display: flex !important; flex-direction: column; align-items: flex-start; gap: 12px; }
    .global-stats { gap: 16px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>${L.title}</h1>
  <span class="subtitle">${L.subtitle}</span>
  <span class="current-terminal" id="current-terminal"></span>
  <button class="settings-btn" id="refreshBtn" onclick="refreshData()">${L.refresh}</button>
  <button class="toggle-hidden-btn" id="toggleHiddenBtn" onclick="toggleShowHidden()">${L.showHidden} (${hiddenDirs.length})</button>
  <button class="settings-btn" onclick="openSettings()">${L.settings}</button>
</div>

<div class="global-stats">
  <div class="global-stat">
    <span class="value">${formatNumber(globalStats.total_sessions)}</span>
    <span class="label">${L.totalSessions}</span>
  </div>
  <div class="global-stat">
    <span class="value">${formatNumber(globalStats.tokens_input + globalStats.tokens_output + globalStats.tokens_reasoning)}</span>
    <span class="label">${L.totalTokens}</span>
  </div>
  <div class="global-stat">
    <span class="value">${formatNumber(globalStats.tokens_cache_read)}</span>
    <span class="label">${L.cacheRead}</span>
  </div>
  <div class="global-stat">
    <span class="value additions">+${formatNumber(globalStats.additions)}</span>
    <span class="label">${L.linesAdded}</span>
  </div>
  <div class="global-stat">
    <span class="value deletions">-${formatNumber(globalStats.deletions)}</span>
    <span class="label">${L.linesDeleted}</span>
  </div>
  <div class="global-stat">
    <span class="value">${formatNumber(globalStats.files_changed)}</span>
    <span class="label">${L.filesChanged}</span>
  </div>
</div>

<div class="main">
  <div class="section-header">
    <div class="section-title">${L.projects} (${projectStats.length})</div>
    <div class="sort-controls">
      <span class="sort-label">${L.sort}</span>
      <button class="sort-btn active" data-sort="last_used" onclick="sortProjects('last_used')">${L.sortRecent}</button>
      <button class="sort-btn" data-sort="session_count" onclick="sortProjects('session_count')">${L.sortMostUsed}</button>
      <button class="sort-btn" data-sort="tokens" onclick="sortProjects('tokens')">${L.sortTokens}</button>
      <button class="sort-btn" data-sort="changes" onclick="sortProjects('changes')">${L.sortChanges}</button>
    </div>
  </div>
  <div id="projectList">
  ${!hasData ? `
  <div class="empty-state">
    <div class="empty-state-icon">&#128450;</div>
    <div class="empty-state-title">${L.dbNotFoundShort}</div>
    <div class="empty-state-message">${L.dbNotFound}</div>
    <button class="save-btn" onclick="openSettings()" style="margin-top:16px; width:auto; padding:10px 32px;">${L.settings}</button>
  </div>
  ` : projectCardsHTML}
  </div>
  <div class="pagination" id="pagination"></div>
</div>

<div class="toast" id="toast"></div>

<!-- Settings Modal -->
<div class="modal-overlay" id="settingsModal">
  <div class="modal">
    <div class="modal-header">
      <h2>${L.settingsTitle}</h2>
      <button class="modal-close" onclick="closeSettings()">&times;</button>
    </div>
    <div class="modal-body">
      <h3 class="settings-section-title">${L.dbPath}</h3>
      <div class="form-hint">${L.dbPathHint}</div>
      <div class="db-path-row">
        <input class="form-input" id="dbPathInput" placeholder="${L.dbPathPlaceholder}" value="${escapeHTML(currentConfig.dbPath || "")}" onkeydown="if(event.key==='Enter')saveDbPath()">
      </div>
      <div class="db-path-status" id="dbPathStatus">
        ${hasData
          ? `<span class="db-status-ok">${dbInfo.source === "configured" ? L.dbConfigured : L.dbAutoDetected}: ${escapeHTML(dbInfo.path)}</span>`
          : `<span class="db-status-error">${L.dbNotFoundShort}</span>`
        }
      </div>

      <h3 class="settings-section-title" style="margin-top:28px;">${L.language}</h3>
      <div class="lang-picker">
        <button class="lang-btn${currentConfig.language === "en" ? " active" : ""}" onclick="setLanguage('en')">English</button>
        <button class="lang-btn${currentConfig.language === "zh" ? " active" : ""}" onclick="setLanguage('zh')">中文</button>
      </div>

      <h3 class="settings-section-title" style="margin-top:28px;">${L.terminal}</h3>
      <div class="form-group">
        <label class="form-label">${L.quickSelect}</label>
        <div class="preset-list" id="presetList"></div>
      </div>

      <div class="or-divider">${L.orCustom}</div>

      <div class="form-group">
        <label class="form-label" for="termCommand">${L.command}</label>
        <div class="form-hint">${L.commandHint}</div>
        <input class="form-input" id="termCommand" placeholder="wt.exe">
      </div>

      <div class="form-group">
        <label class="form-label" for="termArgs">${L.arguments}</label>
        <div class="form-hint">${L.argsHint}</div>
        <input class="form-input" id="termArgs" placeholder="-d {dir} cmd /k opencode">
      </div>

      <h3 class="settings-section-title" style="margin-top:28px;">${L.projectCardFields}</h3>
      <div class="form-hint">${L.projectCardFieldsHint}</div>
      <div class="field-picker" id="projectFieldPicker"></div>

      <h3 class="settings-section-title" style="margin-top:28px;">${L.sessionTableColumns}</h3>
      <div class="form-hint">${L.sessionTableColumnsHint}</div>
      <div class="field-picker" id="sessionColumnPicker"></div>

      <button class="save-btn" style="margin-top:24px;" onclick="saveSettings()">${L.save}</button>
    </div>
  </div>
</div>

<script>
const presets = ${presetsJSON};
const config = ${configJSON};
const dbInfo = ${dbInfoJSON};
const FIELD_I18N = ${JSON.stringify(FIELD_LABEL_KEYS)};
const LANG = ${JSON.stringify(L)};
const ALL_PROJECT_FIELDS = ${JSON.stringify(PROJECT_FIELDS.map((f) => ({ key: f.key, label: L[FIELD_LABEL_KEYS[f.key]] || f.label, default: f.default })))};
const ALL_SESSION_COLUMNS = ${JSON.stringify(SESSION_COLUMNS.map((f) => ({ key: f.key, label: L[FIELD_LABEL_KEYS[f.key]] || f.label, default: f.default })))};

// Show current terminal in header
function updateCurrentTerminal() {
  const el = document.getElementById('current-terminal');
  const t = config.terminal;
  if (t && t.name) {
    el.textContent = t.name;
  } else if (t && t.command) {
    el.textContent = t.command;
  } else {
    el.textContent = LANG.notConfigured;
  }
}
updateCurrentTerminal();

function setLanguage(lang) {
  fetch('/api/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: lang })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) location.reload();
    else showToast('Error', true);
  });
}

function saveDbPath() {
  const input = document.getElementById('dbPathInput');
  const newPath = input.value.trim();
  const statusEl = document.getElementById('dbPathStatus');
  statusEl.innerHTML = '<span style="color:#8b949e;">...</span>';
  fetch('/api/dbpath', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dbPath: newPath })
  })
  .then(r => r.json())
  .then(result => {
    if (result.ok) {
      showToast(LANG.dbPathSaved);
      setTimeout(() => location.reload(), 500);
    } else {
      statusEl.innerHTML = '<span class="db-status-error">' + (result.error || 'Error') + '</span>';
      showToast(result.error || 'Error', true);
    }
  })
  .catch(err => {
    statusEl.innerHTML = '<span class="db-status-error">Error</span>';
    showToast('Error: ' + err.message, true);
  });
}

function toggleProject(projectId) {
  const el = document.getElementById('sessions-' + projectId);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

function openProject(directory) {
  fetch('/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory: directory })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      showToast(LANG.toastOpening + ' ' + (config.terminal && config.terminal.name || 'terminal') + ' ' + LANG.toastIn + ' ' + directory);
    } else {
      showToast(data.error || 'Failed to open terminal', true);
    }
  })
  .catch(err => showToast('Error: ' + err.message, true));
}

function openSession(directory, sessionId) {
  fetch('/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory: directory, sessionId: sessionId })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      showToast(LANG.toastResuming + ' ' + directory);
    } else {
      showToast(data.error || 'Failed to open session', true);
    }
  })
  .catch(err => showToast('Error: ' + err.message, true));
}

function toggleHide(directory, isCurrentlyHidden) {
  const endpoint = isCurrentlyHidden ? '/api/unhide' : '/api/hide';
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory: directory })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      // Reload the page to reflect changes
      location.reload();
    } else {
      showToast(data.error || 'Failed', true);
    }
  })
  .catch(err => showToast('Error: ' + err.message, true));
}

// Pagination state
const PAGE_SIZE = 10;
let currentPage = 1;

function getVisibleCards() {
  const list = document.getElementById('projectList');
  const all = Array.from(list.querySelectorAll('.project-card'));
  const showHidden = document.body.classList.contains('show-hidden');
  return all.filter(c => showHidden || !c.classList.contains('hidden-card'));
}

function applyPagination() {
  const list = document.getElementById('projectList');
  const allCards = Array.from(list.querySelectorAll('.project-card'));
  const showHidden = document.body.classList.contains('show-hidden');
  const visible = allCards.filter(c => showHidden || !c.classList.contains('hidden-card'));
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  // Hide all, then show only current page
  allCards.forEach(c => c.style.display = 'none');
  visible.forEach((c, i) => {
    c.style.display = (i >= start && i < end) ? '' : 'none';
  });
  // Hidden cards not in visible set stay hidden
  if (showHidden) {
    allCards.filter(c => c.classList.contains('hidden-card')).forEach((c, i) => {
      // Already handled above via visible array
    });
  }

  renderPagination(visible.length, totalPages);
}

function renderPagination(total, totalPages) {
  const el = document.getElementById('pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  html += '<button class="page-btn" onclick="goToPage(' + (currentPage - 1) + ')"' + (currentPage <= 1 ? ' disabled' : '') + '>' + LANG.prevPage + '</button>';

  // Show page numbers with ellipsis for large page counts
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  pages.forEach(p => {
    if (p === '...') {
      html += '<span class="page-ellipsis">...</span>';
    } else {
      html += '<button class="page-btn' + (p === currentPage ? ' active' : '') + '" onclick="goToPage(' + p + ')">' + p + '</button>';
    }
  });

  html += '<button class="page-btn" onclick="goToPage(' + (currentPage + 1) + ')"' + (currentPage >= totalPages ? ' disabled' : '') + '>' + LANG.nextPage + '</button>';
  el.innerHTML = html;
}

function goToPage(page) {
  const visible = getVisibleCards();
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  applyPagination();
  // Scroll to top of project list
  document.querySelector('.section-header').scrollIntoView({ behavior: 'smooth' });
}

function sortProjects(sortKey) {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === sortKey);
  });

  const list = document.getElementById('projectList');
  const cards = Array.from(list.querySelectorAll('.project-card'));

  const attrMap = {
    last_used: 'lastUsed',
    session_count: 'sessions',
    tokens: 'tokens',
    changes: 'changes',
  };
  const attr = attrMap[sortKey] || 'lastUsed';

  cards.sort((a, b) => Number(b.dataset[attr]) - Number(a.dataset[attr]));
  cards.forEach(card => list.appendChild(card));
  currentPage = 1;
  applyPagination();
}

function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = LANG.refreshing;
  btn.disabled = true;
  fetch('/api/refresh')
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        location.reload();
      } else {
        showToast(data.error || 'Failed', true);
        btn.textContent = LANG.refresh;
        btn.disabled = false;
      }
    })
    .catch(err => {
      showToast('Error: ' + err.message, true);
      btn.textContent = LANG.refresh;
      btn.disabled = false;
    });
}

function toggleShowHidden() {
  document.body.classList.toggle('show-hidden');
  const btn = document.getElementById('toggleHiddenBtn');
  btn.classList.toggle('active');
  currentPage = 1;
  applyPagination();
}

function showToast(message, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// Settings modal
let selectedPresetIdx = -1;

function openSettings() {
  const modal = document.getElementById('settingsModal');
  modal.classList.add('open');

  // Populate presets
  const list = document.getElementById('presetList');
  list.innerHTML = presets.map((p, i) => {
    const isActive = config.terminal && config.terminal.command === p.command && config.terminal.args === p.args;
    if (isActive) selectedPresetIdx = i;
    return '<div class="preset-item' + (isActive ? ' active' : '') + '" onclick="selectPreset(' + i + ')">'
      + '<div><div class="preset-name">' + p.name + '</div>'
      + '<div class="preset-cmd">' + p.command + ' ' + p.args + '</div></div></div>';
  }).join('');

  // Populate custom fields
  document.getElementById('termCommand').value = config.terminal ? config.terminal.command : '';
  document.getElementById('termArgs').value = config.terminal ? config.terminal.args : '';

  // Populate field pickers
  renderFieldPicker('projectFieldPicker', ALL_PROJECT_FIELDS, config.projectFields || []);
  renderFieldPicker('sessionColumnPicker', ALL_SESSION_COLUMNS, config.sessionColumns || []);

  // Close on overlay click
  modal.onclick = (e) => { if (e.target === modal) closeSettings(); };
}

function renderFieldPicker(containerId, allFields, activeKeys) {
  const container = document.getElementById(containerId);
  container.innerHTML = allFields.map(f => {
    const isActive = activeKeys.includes(f.key);
    return '<label class="field-chip' + (isActive ? ' active' : '') + '" data-key="' + f.key + '">'
      + '<input type="checkbox"' + (isActive ? ' checked' : '') + ' onchange="toggleFieldChip(this)">'
      + f.label + '</label>';
  }).join('');
}

function toggleFieldChip(checkbox) {
  const chip = checkbox.closest('.field-chip');
  chip.classList.toggle('active', checkbox.checked);
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('open');
}

function selectPreset(idx) {
  selectedPresetIdx = idx;
  const items = document.querySelectorAll('.preset-item');
  items.forEach((el, i) => el.classList.toggle('active', i === idx));
  document.getElementById('termCommand').value = presets[idx].command;
  document.getElementById('termArgs').value = presets[idx].args;
}

function getPickerSelection(containerId) {
  const chips = document.querySelectorAll('#' + containerId + ' .field-chip');
  const selected = [];
  chips.forEach(chip => {
    if (chip.querySelector('input').checked) selected.push(chip.dataset.key);
  });
  return selected;
}

function saveSettings() {
  const command = document.getElementById('termCommand').value.trim();
  const args = document.getElementById('termArgs').value.trim();
  if (!command) { showToast(LANG.commandRequired, true); return; }

  const name = selectedPresetIdx >= 0
    && presets[selectedPresetIdx].command === command
    && presets[selectedPresetIdx].args === args
    ? presets[selectedPresetIdx].name
    : 'Custom';

  const terminal = { name, command, args };
  const projectFields = getPickerSelection('projectFieldPicker');
  const sessionColumns = getPickerSelection('sessionColumnPicker');

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminal, projectFields, sessionColumns })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      config.terminal = terminal;
      config.projectFields = projectFields;
      config.sessionColumns = sessionColumns;
      updateCurrentTerminal();
      closeSettings();
      showToast(LANG.toastSaved);
      location.reload();
    } else {
      showToast(data.error || 'Save failed', true);
    }
  })
  .catch(err => showToast('Error: ' + err.message, true));
}
// Init pagination on load
applyPagination();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 6. Utility functions
// ---------------------------------------------------------------------------
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatRelativeTime(ms) {
  if (!ms) return "-";
  const L = getLang();
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return Math.floor(days / 30) + L.t_months;
  if (days > 0) return days + L.t_d;
  if (hours > 0) return hours + L.t_h;
  if (minutes > 0) return minutes + L.t_m;
  return L.t_now;
}

// ---------------------------------------------------------------------------
// 7. Auto-open browser & port management
// ---------------------------------------------------------------------------
function openBrowser(url) {
  const cmds = { win32: `start "" "${url}"`, darwin: `open "${url}"` };
  exec(cmds[process.platform] || `xdg-open "${url}"`, () => {});
}

function killPort(port) {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32"
      ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`
      : `lsof -ti :${port} | xargs kill -9`;
    exec(cmd, () => resolve());
  });
}

// ---------------------------------------------------------------------------
// 8. Main
// ---------------------------------------------------------------------------
// Empty data structure when DB is not available
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

async function main() {
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

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && req.url === "/api/data") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    if (req.method === "POST" && req.url === "/api/open") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { directory, sessionId } = JSON.parse(body);
          if (!directory || !fs.existsSync(directory)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Directory not found: " + directory }));
            return;
          }
          const result = openTerminal(directory, sessionId);
          res.writeHead(result.ok ? 200 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // POST /api/config - save terminal config
    if (req.method === "POST" && req.url === "/api/config") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { terminal, projectFields, sessionColumns, language } = JSON.parse(body);
          if (!terminal || !terminal.command) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "terminal.command is required" }));
            return;
          }
          currentConfig.terminal = terminal;
          if (projectFields) currentConfig.projectFields = projectFields;
          if (sessionColumns) currentConfig.sessionColumns = sessionColumns;
          if (language) currentConfig.language = language;
          saveConfig(currentConfig);
          html = buildHTML(data, dbResult);
          console.log("Config saved:", terminal.name, "| fields:", (projectFields||[]).length, "| columns:", (sessionColumns||[]).length);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // POST /api/dbpath - save database path and reload data
    if (req.method === "POST" && req.url === "/api/dbpath") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { dbPath: newDbPath } = JSON.parse(body);
          const trimmed = (newDbPath || "").trim();

          if (trimmed) {
            // Validate the path exists
            if (!fs.existsSync(trimmed)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: getLang().dbPathInvalid }));
              return;
            }
            currentConfig.dbPath = trimmed;
          } else {
            // Clear configured path, revert to auto-detect
            delete currentConfig.dbPath;
          }
          saveConfig(currentConfig);

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
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // POST /api/set - save any config fields immediately
    if (req.method === "POST" && req.url === "/api/set") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const fields = JSON.parse(body);
          Object.assign(currentConfig, fields);
          saveConfig(currentConfig);
          html = buildHTML(data, dbResult);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // POST /api/hide - hide a directory
    if (req.method === "POST" && req.url === "/api/hide") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { directory } = JSON.parse(body);
          if (!currentConfig.hiddenDirs) currentConfig.hiddenDirs = [];
          if (!currentConfig.hiddenDirs.includes(directory)) {
            currentConfig.hiddenDirs.push(directory);
            saveConfig(currentConfig);
            html = buildHTML(data, dbResult);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, hiddenDirs: currentConfig.hiddenDirs }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // POST /api/unhide - unhide a directory
    if (req.method === "POST" && req.url === "/api/unhide") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { directory } = JSON.parse(body);
          if (currentConfig.hiddenDirs) {
            currentConfig.hiddenDirs = currentConfig.hiddenDirs.filter((d) => d !== directory);
            saveConfig(currentConfig);
            html = buildHTML(data, dbResult);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, hiddenDirs: currentConfig.hiddenDirs }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    if (req.method === "GET" && req.url === "/api/refresh") {
      if (!dbPath) {
        // Try to re-detect in case user configured path externally
        dbResult = findDatabase();
        dbPath = dbResult.path;
      }
      if (!dbPath) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: getLang().dbNotFoundShort }));
        return;
      }
      loadData(dbPath)
        .then((newData) => {
          Object.assign(data, newData);
          html = buildHTML(data, dbResult);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        })
        .catch((err) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${PORT} in use, attempting to take over...`);
      // Try connecting to confirm old server is there, then kill it
      const probe = http.get(`http://${HOST}:${PORT}/`, (res) => {
        res.resume();
        // It responded — it's our old instance. Ask OS to free the port.
        killPort(PORT).then(() => {
          setTimeout(() => server.listen(PORT, HOST), 500);
        });
      });
      probe.on("error", () => {
        // Nothing responding but port is held — wait and retry
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
