'use strict';

const { getDatabase } = require('../db/mongo');

const COLLECTION = 'user_states';
let indexesReady = false;

async function ensureIndexes() {
  if (indexesReady) return;
  await getDatabase()
    .collection(COLLECTION)
    .createIndex({ user_id: 1 }, { unique: true, name: 'uq_user_states_user_id' });
  indexesReady = true;
}

async function setUserState(userId, state) {
  await ensureIndexes();
  await getDatabase()
    .collection(COLLECTION)
    .updateOne(
      { user_id: userId },
      { $set: { state, updated_at: new Date() } },
      { upsert: true }
    );
}

async function getUserState(userId) {
  await ensureIndexes();
  return getDatabase().collection(COLLECTION).findOne({ user_id: userId }, { projection: { _id: 0 } });
}

async function consumeUserState(userId, expectedState) {
  await ensureIndexes();
  const deleted = await getDatabase()
    .collection(COLLECTION)
    .findOneAndDelete({ user_id: userId, state: expectedState });
  return deleted !== null;
}

async function clearUserState(userId) {
  await ensureIndexes();
  const deleted = await getDatabase()
    .collection(COLLECTION)
    .findOneAndDelete({ user_id: userId });
  return deleted !== null;
}

module.exports = { setUserState, getUserState, consumeUserState, clearUserState };
