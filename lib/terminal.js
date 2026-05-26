"use strict";

const { exec } = require("node:child_process");
const { getConfig } = require("./config");

// ---------------------------------------------------------------------------
// Open terminal in a directory
// ---------------------------------------------------------------------------
function openTerminal(directory, sessionId) {
  const currentConfig = getConfig();
  const terminal = currentConfig.terminal;
  if (!terminal || !terminal.command) {
    console.error("No terminal configured");
    return { ok: false, error: "No terminal configured. Open Settings to configure." };
  }

  // Build the opencode command with optional session ID
  const ocCmd = sessionId ? `opencode -s ${sessionId}` : "opencode";

  // Replace placeholders and the opencode command in args.
  // IMPORTANT: replace the opencode command BEFORE substituting {dir},
  // because the directory path may also contain the word "opencode"
  // (e.g. C:\develop\opencode\project) and the regex would match there first.
  let args = terminal.args;

  if (args.includes("{cmd}")) {
    // Explicit {cmd} placeholder — use it directly
    args = args.replace(/\{cmd\}/g, ocCmd);
  } else if (sessionId) {
    // No {cmd} placeholder — replace the literal word "opencode" (not "opencode-dashboard" etc.)
    // Wrap in quotes if the command has arguments (for shells like fish -C)
    // e.g. fish -C opencode  ->  fish -C "opencode -s ses_xxx"
    args = args.replace(/opencode(?![-\w])/, `"${ocCmd}"`);
  }

  // Now replace {dir} — safe because the opencode command was already substituted above
  args = args.replace(/\{dir\}/g, directory);

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

module.exports = { openTerminal };
