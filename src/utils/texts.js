'use strict';

const APPROVED_PAYMENT_DM_TEXT =
  'Aapka payment approve ho gaya ✅\n' +
  'Ab apne group ka chat ID bhejo.\n' +
  'Chat ID nikalne ke liye:\n' +
  '1) @TGDNAbot -> /start -> Group\n' +
  'ya\n' +
  '2) @MissSukoon_bot ko group me admin banao aur /id command use karo';

const DENIED_PAYMENT_DM_TEXT =
  'Aapka payment request is baar approve nahi ho paya ❌\n' +
  'Aap dobara payment details verify karke phir request bhej sakte ho.';

const GENERIC_ERROR_TEXT =
  'Abhi thoda technical issue aa gaya. Thodi der baad phir try karo.';

const HELP_TEXT =
  'Madad guide (simple steps):\n' +
  '1) /start dabao aur Subscription Kharido choose karo\n' +
  '2) Payment ke baad Done ✅ dabao\n' +
  '3) Admin approval ke baad group chat ID bhejo\n' +
  '4) Bot ko group me add karke admin permissions do\n' +
  '5) Protected group me sab stickers bhi 35 second baad auto-delete honge';

const HOW_IT_WORKS_TEXT =
  'Kaise kaam karta hai:\n' +
  '1) Group subscribed aur active hona chahiye\n' +
  '2) Setup complete hone ke baad protection apply hota hai\n' +
  '3) Group me /check aur /status se setup verify kar sakte ho\n' +
  'Yaad rahe: 1 subscription = 1 group';

module.exports = {
  APPROVED_PAYMENT_DM_TEXT,
  DENIED_PAYMENT_DM_TEXT,
  GENERIC_ERROR_TEXT,
  HELP_TEXT,
  HOW_IT_WORKS_TEXT,
};
