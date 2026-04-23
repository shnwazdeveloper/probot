'use strict';

const settings = require('../config/settings');
const { GENERIC_ERROR_TEXT, APPROVED_PAYMENT_DM_TEXT, DENIED_PAYMENT_DM_TEXT } = require('../utils/texts');
const {
  listPendingPaymentRequests,
  updatePaymentStatus,
  isValidPaymentId,
} = require('../services/paymentRequests');
const { setUserState } = require('../services/userStates');
const { revokeProtectedGroup, parseGroupChatId } = require('../services/protectedGroups');
const { getOwnerStats } = require('../services/ownerStats');

async function safeReply(ctx, text) {
  try { await ctx.reply(text, { parse_mode: 'HTML' }); } catch (e) {
    console.error('[owner] safeReply failed:', e.message);
  }
}

function isOwner(ctx) {
  return ctx.from?.id === settings.ownerUserId;
}

function registerOwnerHandlers(bot) {
  // /pending
  bot.command('pending', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!isOwner(ctx)) { await safeReply(ctx, 'Ye command sirf owner ke liye hai.'); return; }
    try {
      const requests = await listPendingPaymentRequests(25);
      if (!requests.length) { await safeReply(ctx, 'Abhi koi pending payment request nahi hai.'); return; }
      const lines = ['Pending payment requests (latest 25) yahan diye gaye hain:'];
      for (const r of requests) {
        const username = r.username ? `@${r.username}` : 'Nahi diya';
        const createdAt = new Date(r.created_at).toUTCString();
        lines.push(
          `- Payment ID: <code>${r.payment_id}</code>\n` +
          `  User ID: <code>${r.user_id}</code>\n` +
          `  Username: ${username}\n` +
          `  Pura Naam: ${r.full_name}\n` +
          `  Status: Pending\n` +
          `  Request Time: ${createdAt}`
        );
      }
      await safeReply(ctx, lines.join('\n\n'));
    } catch { await safeReply(ctx, GENERIC_ERROR_TEXT); }
  });

  // /approve <payment_id>
  bot.command('approve', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!isOwner(ctx)) { await safeReply(ctx, 'Ye command sirf owner ke liye hai.'); return; }
    const args = ctx.match?.trim().toLowerCase() || '';
    if (!args) { await safeReply(ctx, 'Ye format use karo: /approve <payment_id>'); return; }
    if (!isValidPaymentId(args)) { await safeReply(ctx, 'Payment ID invalid hai. Sahi payment_id bhejo.'); return; }
    try {
      const payment = await updatePaymentStatus(args, 'approved');
      if (!payment) { await safeReply(ctx, 'Ye payment pending me nahi mila ya pehle process ho chuka hai.'); return; }
      await setUserState(payment.user_id, 'awaiting_group_id');
      try { await ctx.api.sendMessage(payment.user_id, APPROVED_PAYMENT_DM_TEXT); } catch (e) {
        console.error('[owner] approve DM failed:', e.message);
        await safeReply(ctx, `Payment approve ho gaya ✅, lekin user ko DM nahi gaya.\nPayment ID: <code>${payment.payment_id}</code>`);
        return;
      }
      await safeReply(ctx, `Payment approve ho gaya ✅\nPayment ID: <code>${payment.payment_id}</code>`);
    } catch { await safeReply(ctx, GENERIC_ERROR_TEXT); }
  });

  // /deny <payment_id>
  bot.command('deny', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!isOwner(ctx)) { await safeReply(ctx, 'Ye command sirf owner ke liye hai.'); return; }
    const args = ctx.match?.trim().toLowerCase() || '';
    if (!args) { await safeReply(ctx, 'Ye format use karo: /deny <payment_id>'); return; }
    if (!isValidPaymentId(args)) { await safeReply(ctx, 'Payment ID invalid hai. Sahi payment_id bhejo.'); return; }
    try {
      const payment = await updatePaymentStatus(args, 'denied');
      if (!payment) { await safeReply(ctx, 'Ye payment pending me nahi mila ya pehle process ho chuka hai.'); return; }
      try { await ctx.api.sendMessage(payment.user_id, DENIED_PAYMENT_DM_TEXT); } catch (e) {
        console.error('[owner] deny DM failed:', e.message);
        await safeReply(ctx, `Payment deny ho gaya ❌, lekin user ko DM nahi gaya.\nPayment ID: <code>${payment.payment_id}</code>`);
        return;
      }
      await safeReply(ctx, `Payment deny ho gaya ❌\nPayment ID: <code>${payment.payment_id}</code>`);
    } catch { await safeReply(ctx, GENERIC_ERROR_TEXT); }
  });

  // /revoke <group_id>
  bot.command('revoke', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!isOwner(ctx)) { await safeReply(ctx, 'Ye command sirf owner ke liye hai.'); return; }
    const raw = ctx.match?.trim() || '';
    if (!raw) { await safeReply(ctx, 'Ye format use karo: /revoke <group_id>'); return; }
    const groupId = parseGroupChatId(raw);
    if (groupId === null) { await safeReply(ctx, 'Group ID invalid hai. Example format: -1001234567890'); return; }
    try {
      const result = await revokeProtectedGroup(groupId);
      if (result.status === 'revoked') { await safeReply(ctx, `Group protection disable ho gaya ✅\nGroup ID: <code>${groupId}</code>`); return; }
      if (result.status === 'already_revoked') { await safeReply(ctx, `Is group ka protection pehle se disable hai.\nGroup ID: <code>${groupId}</code>`); return; }
      await safeReply(ctx, `Group record nahi mila.\nGroup ID: <code>${groupId}</code>`);
    } catch { await safeReply(ctx, GENERIC_ERROR_TEXT); }
  });

  // /stats
  bot.command('stats', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    if (!isOwner(ctx)) { await safeReply(ctx, 'Ye command sirf owner ke liye hai.'); return; }
    try {
      const stats = await getOwnerStats();
      await safeReply(ctx,
        `Owner stats ka summary:\n` +
        `- Total users: <code>${stats.totalUsers}</code>\n` +
        `- Active groups: <code>${stats.activeGroups}</code>\n` +
        `- Pending payments: <code>${stats.pendingPayments}</code>`
      );
    } catch { await safeReply(ctx, GENERIC_ERROR_TEXT); }
  });
}

module.exports = { registerOwnerHandlers };
