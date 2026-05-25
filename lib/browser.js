"use strict";

const { exec } = require("node:child_process");
const http = require("node:http");

// ---------------------------------------------------------------------------
// Auto-open browser & port management
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

module.exports = { openBrowser, killPort };
