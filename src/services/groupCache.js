'use strict';

const { getDatabase } = require('../db/mongo');

let refreshIntervalSeconds = 20;
let cache = new Set(); // active group_ids
let cacheLoaded = false;
let refreshTimer = null;

function configureGroupCache({ refreshIntervalSeconds: interval }) {
  refreshIntervalSeconds = interval;
}

async function loadCache() {
  const col = getDatabase().collection('protected_groups');
  const docs = await col
    .find({ subscription_status: 'active' }, { projection: { group_id: 1 } })
    .toArray();
  cache = new Set(docs.map((d) => d.group_id));
  cacheLoaded = true;
}

async function startGroupCache() {
  await loadCache();
  refreshTimer = setInterval(async () => {
    try {
      await loadCache();
    } catch (e) {
      console.error('[GroupCache] Refresh failed:', e.message);
    }
  }, refreshIntervalSeconds * 1000);
}

async function stopGroupCache() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

async function isGroupProtectedCached(groupId) {
  if (!cacheLoaded) return false;
  return cache.has(groupId);
}

function markGroupActiveCached(groupId) {
  cache.add(groupId);
}

function markGroupInactiveCached(groupId) {
  cache.delete(groupId);
}

function countGroupCache() {
  return cache.size;
}

module.exports = {
  configureGroupCache,
  startGroupCache,
  stopGroupCache,
  isGroupProtectedCached,
  markGroupActiveCached,
  markGroupInactiveCached,
  countGroupCache,
};
