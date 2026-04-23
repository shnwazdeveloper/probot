'use strict';

const { getActiveProtectedGroup, isGroupProtected } = require('../services/protectedGroups');
const { getAutoDeleteService } = require('../services/autoDeleteEngine');
const settings = require('../config/settings');

const GROUP_TYPES = ['group', 'supergroup'];
const DELETE_DELAY = settings.botMessageDeleteDelaySeconds;

function isForwardedFromBot(msg) {
  if (msg.forward_from?.is_bot) return true;
  if (msg.forward_origin?.sender_user?.is_bot) return true;
  const senderChatType = (msg.forward_origin?.sender_chat?.type || '').toLowerCase();
  if (['bot', 'channel'].includes(senderChatType)) return true;
  const fwdChatType = (msg.forward_from_chat?.type || '').toLowerCase();
  if (['bot', 'channel'].includes(fwdChatType)) return true;
  return false;
}

function isSenderContextBot(msg) {
  const senderChatType = (msg.sender_chat?.type || '').toLowerCase();
  if (['bot', 'channel'].includes(senderChatType)) return true;
  if (msg.is_automatic_forward) return true;
  if (msg.sender_business_bot?.is_bot) return true;
  return false;
}

function isBotGenerated(msg) {
  if (msg.from?.is_bot) return true;
  if (isSenderContextBot(msg)) return true;
  if (msg.via_bot) return true;
  if (isForwardedFromBot(msg)) return true;
  return false;
}

function pickScheduleKind(msg) {
  if (msg.sticker) return 'sticker';
  if (isBotGenerated(msg)) return 'bot_content';
  return null;
}

async function scheduleIfEligible(ctx, msg) {
  const kind = pickScheduleKind(msg);
  if (!kind) return;

  const chatId = msg.chat?.id;
  if (!chatId) return;

  try {
    let protected_ = await isGroupProtected(chatId);
    if (!protected_) {
      protected_ = (await getActiveProtectedGroup(chatId)) !== null;
    }
    if (!protected_) return;

    getAutoDeleteService().scheduleDelete(ctx.api, chatId, msg.message_id, DELETE_DELAY, kind);
  } catch (e) {
    console.error('[autoDelete] scheduleIfEligible failed:', e.message);
  }
}

function registerAutoDeleteHandlers(bot) {
  bot.on('message', async (ctx) => {
    if (!GROUP_TYPES.includes(ctx.chat.type)) return;
    await scheduleIfEligible(ctx, ctx.message);
  });

  bot.on('edited_message', async (ctx) => {
    if (!GROUP_TYPES.includes(ctx.chat.type)) return;
    await scheduleIfEligible(ctx, ctx.editedMessage);
  });
}

module.exports = { registerAutoDeleteHandlers };
