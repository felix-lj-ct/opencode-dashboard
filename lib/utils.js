"use strict";

// ---------------------------------------------------------------------------
// Utility functions
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

/**
 * Format a millisecond timestamp as a relative time string.
 * Requires a `getLang` function to be passed in for i18n support.
 */
function formatRelativeTime(ms, getLang) {
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

module.exports = { escapeHTML, formatNumber, formatRelativeTime };
