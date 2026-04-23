'use strict';

const { getDatabase } = require('../db/mongo');
const { countPendingPaymentRequests } = require('./paymentRequests');
const { countActiveProtectedGroups } = require('./protectedGroups');

async function getOwnerStats() {
  const db = getDatabase();
  const [paymentUsers, groupOwners, stateUsers] = await Promise.all([
    db.collection('payments').distinct('user_id'),
    db.collection('protected_groups').distinct('owner_user_id'),
    db.collection('user_states').distinct('user_id'),
  ]);

  const allUserIds = new Set([...paymentUsers, ...groupOwners, ...stateUsers]);

  const [activeGroups, pendingPayments] = await Promise.all([
    countActiveProtectedGroups(),
    countPendingPaymentRequests(),
  ]);

  return {
    totalUsers: allUserIds.size,
    activeGroups,
    pendingPayments,
  };
}

module.exports = { getOwnerStats };
