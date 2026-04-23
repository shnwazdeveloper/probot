'use strict';

const { getDatabase } = require('../db/mongo');
const {
  isGroupProtectedCached,
  markGroupActiveCached,
  markGroupInactiveCached,
  countGroupCache,
} = require('./groupCache');

const COLLECTION = 'protected_groups';
const GROUP_CHAT_ID_RE = /^-(?:100\d{5,}|\d{5,})$/;

let indexesReady = false;

function parseGroupChatId(rawText) {
  const cleaned = rawText.trim();
  if (!GROUP_CHAT_ID_RE.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

async function ensureIndexes() {
  if (indexesReady) return;
  const col = getDatabase().collection(COLLECTION);
  await col.createIndex({ group_id: 1 }, { unique: true, name: 'uq_protected_groups_group_id' });
  await col.createIndex(
    { owner_user_id: 1, subscription_status: 1 },
    { name: 'idx_protected_groups_owner_status' }
  );
  indexesReady = true;
}

async function bindProtectedGroup({ ownerUserId, groupId }) {
  await ensureIndexes();
  const col = getDatabase().collection(COLLECTION);
  const doc = {
    group_id: groupId,
    owner_user_id: ownerUserId,
    subscription_status: 'active',
    activated_at: new Date(),
  };
  try {
    await col.insertOne(doc);
  } catch (err) {
    if (err.code === 11000) return { status: 'group_already_bound' };
    throw err;
  }
  markGroupActiveCached(groupId);
  return { status: 'created' };
}

async function revokeProtectedGroup(groupId) {
  await ensureIndexes();
  const col = getDatabase().collection(COLLECTION);
  const result = await col.updateOne(
    { group_id: groupId, subscription_status: 'active' },
    { $set: { subscription_status: 'revoked' } }
  );
  if (result.modifiedCount > 0) {
    markGroupInactiveCached(groupId);
    return { status: 'revoked' };
  }
  const existing = await col.findOne({ group_id: groupId }, { projection: { group_id: 1 } });
  markGroupInactiveCached(groupId);
  if (!existing) return { status: 'not_found' };
  return { status: 'already_revoked' };
}

async function getActiveProtectedGroup(groupId) {
  await ensureIndexes();
  const col = getDatabase().collection(COLLECTION);
  const doc = await col.findOne(
    { group_id: groupId, subscription_status: 'active' },
    { projection: { _id: 0 } }
  );
  if (!doc) {
    markGroupInactiveCached(groupId);
    return null;
  }
  markGroupActiveCached(groupId);
  return doc;
}

async function isGroupProtected(groupId) {
  return isGroupProtectedCached(groupId);
}

async function countActiveProtectedGroups() {
  return countGroupCache();
}

async function listActiveGroupsByOwner(ownerUserId, limit = 5) {
  await ensureIndexes();
  const col = getDatabase().collection(COLLECTION);
  return col
    .find(
      { owner_user_id: ownerUserId, subscription_status: 'active' },
      { projection: { _id: 0 } }
    )
    .sort({ activated_at: 1 })
    .limit(Math.min(Math.max(1, limit), 100))
    .toArray();
}

module.exports = {
  parseGroupChatId,
  ensureGroupIndexes: ensureIndexes,   // ← fixed export name
  bindProtectedGroup,
  revokeProtectedGroup,
  getActiveProtectedGroup,
  isGroupProtected,
  countActiveProtectedGroups,
  listActiveGroupsByOwner,
};
