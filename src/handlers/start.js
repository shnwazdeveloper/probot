'use strict';

const { CB, startMenuKeyboard, paymentActionKeyboard, paymentReviewKeyboard, checkSetupKeyboard } = require('../keyboards');
const { HELP_TEXT, HOW_IT_WORKS_TEXT, GENERIC_ERROR_TEXT, APPROVED_PAYMENT_DM_TEXT } = require('../utils/texts');
const { createPendingPaymentRequest, getPendingPaymentByUser } = require('../services/paymentRequests');
const { listActiveGroupsByOwner, bindProtectedGroup, parseGroupChatId } = require('../services/protectedGroups');
const { setUserState, getUserState, consumeUserState, clearUserState } = require('../services/userStates');
const { isDoneClickAllowed } = require('../services/paymentGuard');
const settings = require('../config/settings');

const AWAITING_GROUP_ID = 'awaiting_group_id';

async function safeReply(ctx, text, extra = {}) {
  try { await ctx.reply(text, { parse_mode: 'HTML', ...extra }); } catch (e) {
    console.error('[start] safeReply failed:', e.message);
  }
}

async function safeCbAnswer(ctx, text = '', showAlert = false) {
  try { await ctx.answerCallbackQuery({ text, show_alert: showAlert }); } catch {}
}

async function sendSubscriptionSummary(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return;
  try {
    const [activeGroups, pending, stateRecord] = await Promise.all([
      listActiveGroupsByOwner(userId, 5),
      getPendingPaymentByUser(userId),
      getUserState(userId),
    ]);
    const lines = ['Aapki subscription summary:'];
    if (activeGroups.length > 0) {
      lines.push('Status: Active ✅', 'Linked groups:');
      for (const g of activeGroups) lines.push(`- <code>${g.group_id}</code>`);
    } else if (pending) {
      const createdText = new Date(pending.created_at).toUTCString();
      lines.push('Status: Pending approval ⏳', `Payment ID: <code>${pending.payment_id}</code>`, `Request Time: ${createdText}`);
    } else {
      lines.push('Status: Abhi active ya pending subscription nahi mili.', 'Start karne ke liye /start dabao aur Subscription Kharido choose karo.');
    }
    if (stateRecord?.state === AWAITING_GROUP_ID) {
      lines.push('', 'Next step pending hai: apna group chat ID DM me bhejo.');
    }
    lines.push('', 'Yaad rahe: 1 subscription = 1 group.');
    await safeReply(ctx, lines.join('\n'));
  } catch (e) {
    console.error('[start] sendSubscriptionSummary failed:', e.message);
    await safeReply(ctx, GENERIC_ERROR_TEXT);
  }
}

function registerStartHandlers(bot) {
  // /start in private
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const firstName = ctx.from?.first_name || 'User';
    await safeReply(ctx,
      `Namaste ${firstName}! EliteXprotectorBot me aapka welcome hai.\n\n` +
      'Ye bot aapke group ko spam aur unwanted activity se protect karne me help karta hai.\n' +
      'Beginner ho to bhi tension mat lo, steps simple rahenge.\n\n' +
      'Quick actions neeche diye gaye hain.\nYaad rahe: 1 subscription = 1 group.',
      { reply_markup: startMenuKeyboard() }
    );
  });

  // /madad
  bot.command('madad', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await safeReply(ctx, HELP_TEXT);
  });

  // /meri_subscription
  bot.command('meri_subscription', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await sendSubscriptionSummary(ctx);
  });

  // /cancel
  bot.command('cancel', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;
    try {
      const cleared = await clearUserState(userId);
      if (cleared) {
        await safeReply(ctx, 'Current flow cancel ho gaya ✅\nJab ready ho tab /start se phir continue kar sakte ho.');
      } else {
        await safeReply(ctx, 'Abhi koi active DM flow chal nahi raha hai.');
      }
    } catch {
      await safeReply(ctx, GENERIC_ERROR_TEXT);
    }
  });

  // Subscription buy callback
  bot.callbackQuery(CB.SUBSCRIPTION_BUY, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await safeCbAnswer(ctx);
    try {
      await ctx.replyWithPhoto(settings.paymentQrImageUrl, {
        caption:
          'Subscription ka price: ₹100\n' +
          'QR scan karke payment complete karo.\n' +
          'Payment complete hone ke baad Done ✅ dabao.\n' +
          'Agar abhi continue nahi karna hai to Cancel ❌ dabao.\n' +
          'Yaad rahe: 1 subscription = 1 group.',
        reply_markup: paymentActionKeyboard(),
      });
    } catch (e) {
      console.error('[start] subscription QR send failed:', e.message);
      await safeReply(ctx, GENERIC_ERROR_TEXT);
    }
  });

  // My subscription
  bot.callbackQuery(CB.MY_SUBSCRIPTION, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await safeCbAnswer(ctx);
    await sendSubscriptionSummary(ctx);
  });

  // Flow cancel
  bot.callbackQuery(CB.FLOW_CANCEL, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await safeCbAnswer(ctx, 'Current flow cancel kar diya.');
    const userId = ctx.from?.id;
    if (!userId) return;
    try {
      const cleared = await clearUserState(userId);
      await safeReply(ctx, cleared
        ? 'Current flow cancel ho gaya ✅\nJab ready ho tab /start se phir continue kar sakte ho.'
        : 'Abhi koi active DM flow chal nahi raha hai.'
      );
    } catch { await safeReply(ctx, GENERIC_ERROR_TEXT); }
  });

  // Help callback
  bot.callbackQuery(CB.HELP, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await safeCbAnswer(ctx);
    await safeReply(ctx, HELP_TEXT);
  });

  // How it works callback
  bot.callbackQuery(CB.HOW_IT_WORKS, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await safeCbAnswer(ctx);
    await safeReply(ctx, HOW_IT_WORKS_TEXT);
  });

  // Payment done
  bot.callbackQuery(CB.PAYMENT_DONE, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!isDoneClickAllowed(userId)) {
      await safeCbAnswer(ctx, 'Done ko baar-baar mat dabao, thoda wait karo.');
      return;
    }

    let result;
    try {
      result = await createPendingPaymentRequest({
        userId,
        username: ctx.from.username,
        fullName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ''),
      });
    } catch (e) {
      console.error('[start] createPendingPaymentRequest failed:', e.message);
      await safeCbAnswer(ctx, GENERIC_ERROR_TEXT, true);
      return;
    }

    if (result.status === 'duplicate') {
      await safeCbAnswer(ctx, 'Aapka pending request pehle se bana hua hai.');
      await safeReply(ctx, 'Aapka payment request pehle se pending hai, admin approve karega.');
      return;
    }

    await safeCbAnswer(ctx, 'Done receive ho gaya ✅');
    const paymentId = result.paymentId;

    if (paymentId) {
      const usernameText = ctx.from.username ? `@${ctx.from.username}` : 'Nahi diya';
      const fullName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');
      try {
        await ctx.api.sendMessage(
          settings.adminReviewChatId,
          `Naya payment review request aaya hai.\n\nUser ID: <code>${userId}</code>\nUsername: ${usernameText}\nPura Naam: ${fullName}\nPayment ID: <code>${paymentId}</code>\nStatus: Pending`,
          { parse_mode: 'HTML', reply_markup: paymentReviewKeyboard(paymentId) }
        );
      } catch (e) {
        console.error('[start] admin review send failed:', e.message);
      }
    }

    await safeReply(ctx, 'Payment request bhej diya gaya hai, admin approve karega.');
  });

  // Payment cancel
  bot.callbackQuery(CB.PAYMENT_CANCEL, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await safeCbAnswer(ctx, 'Payment flow close kar diya gaya.');
    await safeReply(ctx, 'Theek hai, payment flow cancel ho gaya. Jab ready ho tab phir se Subscription Kharido dabao.');
  });

  // Check setup callback
  bot.callbackQuery(CB.CHECK_SETUP, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await safeCbAnswer(ctx, 'Check Setup feature next step me add hoga.');
    await safeReply(ctx, 'Abhi placeholder mode hai. Pehle bot ko group me add karke admin setup complete karo.');
  });

  // Private text messages (group ID binding)
  bot.on('message:text', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    const userId = ctx.from?.id;
    if (!userId) return;

    let stateRecord;
    try { stateRecord = await getUserState(userId); } catch {
      await safeReply(ctx, GENERIC_ERROR_TEXT); return;
    }
    if (!stateRecord || stateRecord.state !== AWAITING_GROUP_ID) return;

    const groupId = parseGroupChatId(text);
    if (groupId === null) {
      await safeReply(ctx, 'Chat ID format sahi nahi hai. Numeric group chat ID bhejo, example: -1001234567890');
      return;
    }

    let consumed;
    try { consumed = await consumeUserState(userId, AWAITING_GROUP_ID); } catch {
      await safeReply(ctx, GENERIC_ERROR_TEXT); return;
    }
    if (!consumed) { await safeReply(ctx, 'Yeh group binding pehle hi process ho chuka hai.'); return; }

    let bindResult;
    try {
      bindResult = await bindProtectedGroup({ ownerUserId: userId, groupId });
    } catch (e) {
      try { await setUserState(userId, AWAITING_GROUP_ID); } catch {}
      await safeReply(ctx, 'Abhi group bind karte waqt issue aa gaya. Thodi der baad same chat ID phir bhejo.'); return;
    }

    if (bindResult.status === 'group_already_bound') {
      try { await setUserState(userId, AWAITING_GROUP_ID); } catch {}
      await safeReply(ctx, 'Yeh group pehle se linked hai. Koi aur valid group chat ID bhejo.'); return;
    }

    await safeReply(ctx,
      'Group bind ho gaya ✅\n' +
      'Yaad rahe: 1 approved subscription = 1 group.\n\n' +
      'Ab setup ke liye ye steps follow karo:\n' +
      '1) @EliteXprotectorBot ko group me add karo\n' +
      '2) Bot ko admin banao\n' +
      '3) Delete messages permission do\n' +
      '4) Add members / Invite users permission bhi do\n\n' +
      'Setup complete ho jaye to Check Setup dabao.',
      { reply_markup: checkSetupKeyboard() }
    );
  });
}

module.exports = { registerStartHandlers };
