'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db/mongo');

const COLLECTION = 'payments';
const PAYMENT_ID_RE = /^[0-9a-f]{32}$/;

let indexesReady = false;

function isValidPaymentId(id) {
  return PAYMENT_ID_RE.test(id);
}

async function ensureIndexes() {
  if (indexesReady) return;
  const col = getDatabase().collection(COLLECTION);
  await col.createIndex({ payment_id: 1 }, { unique: true, name: 'uq_payments_payment_id' });
  await col.createIndex(
    { user_id: 1, status: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'pending' },
      name: 'uq_payments_user_pending',
    }
  );
  await col.createIndex({ status: 1, created_at: 1 }, { name: 'idx_payments_status_created_at' });
  indexesReady = true;
}

async function createPendingPaymentRequest({ userId, username, fullName }) {
  await ensureIndexes();
  const col = getDatabase().collection(COLLECTION);

  const existing = await col.findOne({ user_id: userId, status: 'pending' }, { projection: { payment_id: 1 } });
  if (existing) {
    return { status: 'duplicate', paymentId: existing.payment_id };
  }

  const paymentId = uuidv4().replace(/-/g, '');
  const doc = {
    payment_id: paymentId,
    user_id: userId,
    username: username || null,
    full_name: fullName,
    status: 'pending',
    created_at: new Date(),
  };

  try {
    await col.insertOne(doc);
  } catch (err) {
    if (err.code === 11000) return { status: 'duplicate', paymentId: null };
    throw err;
  }

  return { status: 'created', paymentId };
}

async function listPendingPaymentRequests(limit = 20) {
  await ensureIndexes();
  const col = getDatabase().collection(COLLECTION);
  return col
    .find({ status: 'pending' }, { projection: { _id: 0 } })
    .sort({ created_at: 1 })
    .limit(Math.min(Math.max(1, limit), 100))
    .toArray();
}

async function countPendingPaymentRequests() {
  await ensureIndexes();
  return getDatabase().collection(COLLECTION).countDocuments({ status: 'pending' });
}

async function getPendingPaymentByUser(userId) {
  await ensureIndexes();
  return getDatabase().collection(COLLECTION).findOne(
    { user_id: userId, status: 'pending' },
    { projection: { _id: 0 } }
  );
}

async function updatePaymentStatus(paymentId, status) {
  if (status === 'pending') throw new Error('Cannot set status back to pending');
  const normalized = paymentId.trim().toLowerCase();
  if (!isValidPaymentId(normalized)) return null;
  await ensureIndexes();
  const col = getDatabase().collection(COLLECTION);
  const updated = await col.findOneAndUpdate(
    { payment_id: normalized, status: 'pending' },
    { $set: { status } },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  return updated || null;
}

module.exports = {
  isValidPaymentId,
  createPendingPaymentRequest,
  listPendingPaymentRequests,
  countPendingPaymentRequests,
  getPendingPaymentByUser,
  updatePaymentStatus,
};
