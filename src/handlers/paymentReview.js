'use strict';

const settings = require('../config/settings');
const { parsePaymentReviewCallback } = require('../keyboards');
const { APPROVED_PAYMENT_DM_TEXT, DENIED_PAYMENT_DM_TEXT, GENERIC_ERROR_TEXT } = require('../utils/texts');
const { updatePaymentStatus, isValidPaymentId } = require('../services/paymentRequests');
const { setUserState } = require('../services/userStates');

function registerPaymentReviewHandlers(bot) {
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data || '';
    if (!data.startsWith('payment_review:')) return next();

    const parsed = parsePaymentReviewCallback(data);
    if (!parsed) { await ctx.answerCallbackQuery({ text: 'Callback data invalid hai.', show_alert: true }); return; }

    const { action, paymentId } = parsed;

    // Only owner
    if (ctx.from.id !== settings.ownerUserId) {
      await ctx.answerCallbackQuery({
        text: `Access mana hai. Sirf @${settings.ownerUsername} approve ya deny kar sakta hai.`,
        show_alert: true,
      });
      return;
    }

    // Only in admin review chat
    if (!ctx.chat || ctx.chat.id !== settings.adminReviewChatId) {
      await ctx.answerCallbackQuery({ text: 'Yeh action sirf admin review channel me valid hai.', show_alert: true });
      return;
    }

    const normalizedId = paymentId.trim().toLowerCase();
    if (!isValidPaymentId(normalizedId)) {
      await ctx.answerCallbackQuery({ text: 'Callback data invalid hai, action cancel kar diya gaya.', show_alert: true });
      return;
    }

    const newStatus = action === 'approve' ? 'approved' : 'denied';
    let payment;
    try {
      payment = await updatePaymentStatus(normalizedId, newStatus);
    } catch (e) {
      console.error('[paymentReview] updatePaymentStatus failed:', e.message);
      await ctx.answerCallbackQuery({ text: GENERIC_ERROR_TEXT, show_alert: true });
      return;
    }

    if (!payment) {
      await ctx.answerCallbackQuery({ text: 'Yeh request pending me nahi hai ya pehle process ho chuki hai.', show_alert: true });
      return;
    }

    if (newStatus === 'approved') {
      try { await setUserState(payment.user_id, 'awaiting_group_id'); } catch (e) {
        console.error('[paymentReview] setUserState failed:', e.message);
        await ctx.answerCallbackQuery({ text: 'Payment approve hua, lekin user state update me issue aaya.', show_alert: true });
        return;
      }
    }

    const dmText = newStatus === 'approved' ? APPROVED_PAYMENT_DM_TEXT : DENIED_PAYMENT_DM_TEXT;
    let dmSent = true;
    try { await ctx.api.sendMessage(payment.user_id, dmText); } catch (e) {
      dmSent = false;
      console.error('[paymentReview] DM failed:', e.message);
    }

    const statusLabel = action === 'approve' ? 'Approve ho gaya ✅' : 'Deny ho gaya ❌';
    const existingText = ctx.callbackQuery.message?.text || '';
    let updatedLines = existingText.split('\n');
    const statusIdx = updatedLines.findIndex((l) => l.toLowerCase().startsWith('status:'));
    if (statusIdx >= 0) updatedLines[statusIdx] = `Status: ${statusLabel}`;
    else updatedLines.push(`Status: ${statusLabel}`);
    if (!dmSent) updatedLines.push('DM Status: User ko DM send nahi ho paya (blocked ya privacy issue).');

    try {
      await ctx.editMessageText(updatedLines.join('\n'), { parse_mode: 'HTML', reply_markup: undefined });
    } catch {}

    const resultText = action === 'approve'
      ? (dmSent ? 'Payment request approve kar diya gaya ✅.' : 'Payment request approve ho gaya ✅, lekin user ko DM nahi gaya.')
      : (dmSent ? 'Payment request deny kar diya gaya ❌.' : 'Payment request deny ho gaya ❌, lekin user ko DM nahi gaya.');

    await ctx.answerCallbackQuery({ text: resultText, show_alert: !dmSent });
  });
}

module.exports = { registerPaymentReviewHandlers };
