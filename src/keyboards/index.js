'use strict';

const { InlineKeyboard } = require('grammy');

// Callback data constants
const CB = {
  SUBSCRIPTION_BUY: 'start:subscription_buy',
  HELP: 'start:help',
  HOW_IT_WORKS: 'start:how_it_works',
  MY_SUBSCRIPTION: 'start:my_subscription',
  FLOW_CANCEL: 'start:flow_cancel',
  PAYMENT_DONE: 'payment:done',
  PAYMENT_CANCEL: 'payment:cancel',
  CHECK_SETUP: 'setup:check',
};

function startMenuKeyboard() {
  return new InlineKeyboard()
    .text('Subscription Kharido', CB.SUBSCRIPTION_BUY).row()
    .text('Meri Subscription', CB.MY_SUBSCRIPTION)
    .text('Madad', CB.HELP).row()
    .text('Kaise Kaam Karta Hai', CB.HOW_IT_WORKS).row()
    .text('Flow Cancel Karo', CB.FLOW_CANCEL);
}

function paymentActionKeyboard() {
  return new InlineKeyboard()
    .text('Done ✅', CB.PAYMENT_DONE)
    .text('Cancel ❌', CB.PAYMENT_CANCEL);
}

function paymentReviewKeyboard(paymentId) {
  return new InlineKeyboard()
    .text('Approve ✅', `payment_review:approve:${paymentId}`)
    .text('Deny ❌', `payment_review:deny:${paymentId}`);
}

function checkSetupKeyboard() {
  return new InlineKeyboard().text('Check Setup', CB.CHECK_SETUP);
}

// Parse payment_review callback: "payment_review:approve:PAYMENTID"
function parsePaymentReviewCallback(data) {
  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== 'payment_review') return null;
  const action = parts[1]; // 'approve' or 'deny'
  const paymentId = parts[2];
  if (!['approve', 'deny'].includes(action)) return null;
  return { action, paymentId };
}

module.exports = {
  CB,
  startMenuKeyboard,
  paymentActionKeyboard,
  paymentReviewKeyboard,
  checkSetupKeyboard,
  parsePaymentReviewCallback,
};
