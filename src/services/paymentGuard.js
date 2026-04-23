'use strict';

const COOLDOWN_MS = 12_000;
const STALE_TTL_MS = 3_600_000;

const lastClickAt = new Map();

function cleanup(now) {
  const staleThreshold = now - STALE_TTL_MS;
  for (const [userId, ts] of lastClickAt) {
    if (ts < staleThreshold) lastClickAt.delete(userId);
  }
}

function isDoneClickAllowed(userId) {
  const now = Date.now();
  const last = lastClickAt.get(userId);
  if (last !== undefined && now - last < COOLDOWN_MS) return false;
  lastClickAt.set(userId, now);
  cleanup(now);
  return true;
}

module.exports = { isDoneClickAllowed };
