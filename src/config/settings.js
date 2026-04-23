'use strict';

require('dotenv').config();

function getInt(key, defaultVal) {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultVal;
  const n = parseInt(v, 10);
  return isNaN(n) ? defaultVal : n;
}

function getFloat(key, defaultVal) {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultVal;
  const n = parseFloat(v);
  return isNaN(n) ? defaultVal : n;
}

function getBool(key, defaultVal) {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultVal;
  return v.toLowerCase() === 'true';
}

function getStr(key, defaultVal = '') {
  return process.env[key] || defaultVal;
}

function requireStr(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

const settings = {
  botToken: requireStr('BOT_TOKEN'),
  mongoUri: requireStr('MONGO_URI'),
  mongoDbName: getStr('MONGO_DB_NAME', 'elitex_protector'),
  logLevel: getStr('LOG_LEVEL', 'INFO'),
  ownerUserId: getInt('OWNER_USER_ID', 8088623806),
  ownerUsername: getStr('OWNER_USERNAME', 'EliteSid'),
  adminReviewChatId: getInt('ADMIN_REVIEW_CHAT_ID', -1003761739308),
  paymentQrImageUrl: getStr('PAYMENT_QR_IMAGE_URL', 'https://files.catbox.moe/0svb7x.jpg'),

  botMessageDeleteDelaySeconds: getInt('BOT_MESSAGE_DELETE_DELAY_SECONDS', 35),
  protectedGroupCacheRefreshSeconds: getInt('PROTECTED_GROUP_CACHE_REFRESH_SECONDS', 20),

  autoDeleteTickIntervalMs: getInt('AUTO_DELETE_TICK_INTERVAL_MS', 200),
  autoDeleteChunkSize: getInt('AUTO_DELETE_CHUNK_SIZE', 100),
  autoDeleteRetryAttempts: getInt('AUTO_DELETE_RETRY_ATTEMPTS', 5),
  autoDeleteRetryBaseSeconds: getFloat('AUTO_DELETE_RETRY_BASE_SECONDS', 1.5),
  autoDeleteRetryMaxSeconds: getFloat('AUTO_DELETE_RETRY_MAX_SECONDS', 35),
  autoDeleteWorkerConcurrency: getInt('AUTO_DELETE_WORKER_CONCURRENCY', 12),
  autoDeleteMetricsLogIntervalSeconds: getInt('AUTO_DELETE_METRICS_LOG_INTERVAL_SECONDS', 60),
  autoDeletePersistenceEnabled: getBool('AUTO_DELETE_PERSISTENCE_ENABLED', false),
  autoDeletePersistenceTtlHours: getInt('AUTO_DELETE_PERSISTENCE_TTL_HOURS', 24),
  autoDeleteRestoreLimit: getInt('AUTO_DELETE_RESTORE_LIMIT', 20000),

  observerEnabled: getBool('OBSERVER_ENABLED', false),

  botRunMode: getStr('BOT_RUN_MODE', 'polling'),
  webhookMode: getBool('WEBHOOK_MODE', false),
  webhookBaseUrl: getStr('WEBHOOK_BASE_URL', ''),
  webhookPath: getStr('WEBHOOK_PATH', '/webhook/telegram'),
  webhookSecretToken: getStr('WEBHOOK_SECRET_TOKEN', ''),
  webServerHost: getStr('WEB_SERVER_HOST', '0.0.0.0'),
  port: getInt('PORT', 10000),

  get resolvedRunMode() {
    return this.webhookMode ? 'webhook' : this.botRunMode;
  },

  get normalizedWebhookPath() {
    const path = this.webhookPath.trim();
    if (!path) return '/webhook/telegram';
    return path.startsWith('/') ? path : `/${path}`;
  },

  get webhookUrl() {
    const base = this.webhookBaseUrl.trim().replace(/\/$/, '');
    if (!base) return null;
    return `${base}${this.normalizedWebhookPath}`;
  },
};

module.exports = settings;
