'use strict';

const { GENERIC_ERROR_TEXT } = require('../utils/texts');
const { getActiveProtectedGroup } = require('../services/protectedGroups');
const { getAutoDeleteService } = require('../services/autoDeleteEngine');
const settings = require('../config/settings');

const GROUP_TYPES = ['group', 'supergroup'];

function observerStatusText() {
  if (!settings.observerEnabled) return 'Disabled (other bot messages may not be visible)';
  return 'Enabled';
}

async function safeReply(ctx, text) {
  try {
    const sent = await ctx.reply(text, { parse_mode: 'HTML' });
    // Schedule auto-delete for the bot's own reply
    const svc = getAutoDeleteService();
    if (svc.started) {
      svc.scheduleDelete(ctx.api, sent.chat.id, sent.message_id, settings.botMessageDeleteDelaySeconds, 'bot_content');
    }
  } catch (e) {
    console.error('[groupSetup] safeReply failed:', e.message);
  }
}

function registerGroupSetupHandlers(bot) {
  // /check
  bot.command('check', async (ctx) => {
    if (!GROUP_TYPES.includes(ctx.chat.type)) return;
    const chatId = ctx.chat.id;
    try {
      const [protectedGroup, me, botMember] = await Promise.all([
        getActiveProtectedGroup(chatId),
        ctx.api.getMe(),
        ctx.api.getChatMember(chatId, (await ctx.api.getMe()).id),
      ]);

      const status = botMember.status;
      const canDelete = status === 'creator' || (status === 'administrator' && botMember.can_delete_messages);
      const canInvite = status === 'creator' || (status === 'administrator' && botMember.can_invite_users);
      const subscriptionText = protectedGroup ? 'Active' : 'Not active';
      const deletePermText = canDelete ? 'Yes' : 'No';
      const invitePermText = canInvite ? 'Yes' : 'No';
      const observerStatus = observerStatusText();

      const warnings = [];
      if (!canDelete) warnings.push('- Missing Delete Messages permission: auto-delete will not work.');

      let warningsBlock = '';
      if (warnings.length) warningsBlock = '\n\nCritical warnings:\n' + warnings.join('\n');

      await safeReply(ctx,
        'Setup ka status summary:\n' +
        `1) Subscription/Protection: ${subscriptionText}\n` +
        `2) Delete messages permission: ${deletePermText}\n` +
        `3) Add members / Invite users permission: ${invitePermText}\n` +
        `4) Observer status (other-bot capture): ${observerStatus}\n\n` +
        'Note: Observer auto-invite ke liye Invite users permission dena zaroori hai.' +
        warningsBlock
      );
    } catch (e) {
      console.error('[groupSetup] /check failed:', e.message);
      await safeReply(ctx, 'Setup check abhi complete nahi ho paya. Bot permissions aur network dubara check karke /check phir chalayo.');
    }
  });

  // /status
  bot.command('status', async (ctx) => {
    if (!GROUP_TYPES.includes(ctx.chat.type)) return;
    const chatId = ctx.chat.id;
    try {
      const protectedGroup = await getActiveProtectedGroup(chatId);
      if (!protectedGroup) {
        await safeReply(ctx, 'Protection abhi active nahi hai. Ye group subscribed nahi hai.');
        return;
      }
      const activatedAt = new Date(protectedGroup.activated_at).toUTCString();
      await safeReply(ctx,
        `Protection is active.\nOwner User ID: <code>${protectedGroup.owner_user_id}</code>\nActivation Time: ${activatedAt}`
      );
    } catch (e) {
      console.error('[groupSetup] /status failed:', e.message);
      await safeReply(ctx, GENERIC_ERROR_TEXT);
    }
  });

  // Bot added to group event
  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.myChatMember;
    if (!GROUP_TYPES.includes(ctx.chat.type)) return;

    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const wasInactive = ['left', 'kicked'].includes(oldStatus);
    const isNowActive = ['member', 'administrator'].includes(newStatus);
    if (!wasInactive || !isNowActive) return;

    try {
      const protectedGroup = await getActiveProtectedGroup(ctx.chat.id);
      if (protectedGroup) return;
      const sent = await ctx.api.sendMessage(
        ctx.chat.id,
        'Namaste! Ye group subscribed nahi hai, isliye protection abhi active nahi hoga.\n' +
        'Subscription ke liye owner ko bot DM me /start karke process complete karna hoga.'
      );
      const svc = getAutoDeleteService();
      if (svc.started) {
        svc.scheduleDelete(ctx.api, sent.chat.id, sent.message_id, settings.botMessageDeleteDelaySeconds, 'bot_content');
      }
    } catch (e) {
      console.error('[groupSetup] my_chat_member handler failed:', e.message);
    }
  });
}

module.exports = { registerGroupSetupHandlers };
