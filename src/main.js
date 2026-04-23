'use strict';

const { Bot, webhookCallback } = require('grammy');
const Fastify = require('fastify');
const settings = require('./config/settings');
const { connectToMongo, closeMongo } = require('./db/mongo');
const {
  configureAutoDeleteService,
  startAutoDeleteService,
  stopAutoDeleteService,
} = require('./services/autoDeleteEngine');
const {
  configureGroupCache,
  startGroupCache,
  stopGroupCache,
} = require('./services/groupCache');
const { ensureIndexes: ensurePaymentIndexes } = require('./services/paymentRequests');
const { ensureIndexes: ensureGroupIndexes } = require('./services/protectedGroups');

const { registerStartHandlers } = require('./handlers/start');
const { registerOwnerHandlers } = require('./handlers/ownerCommands');
const { registerPaymentReviewHandlers } = require('./handlers/paymentReview');
const { registerGroupSetupHandlers } = require('./handlers/groupSetup');
const { registerAutoDeleteHandlers } = require('./handlers/autoDelete');

async function startupInfra(bot) {
  await connectToMongo(settings.mongoUri, settings.mongoDbName);
  await ensurePaymentIndexes();
  await ensureGroupIndexes();
  configureGroupCache({ refreshIntervalSeconds: settings.protectedGroupCacheRefreshSeconds });
  await startGroupCache();
  configureAutoDeleteService({
    deleteDelaySeconds: settings.botMessageDeleteDelaySeconds,
    tickIntervalMs: settings.autoDeleteTickIntervalMs,
    maxBatchSize: settings.autoDeleteChunkSize,
    maxRetryAttempts: settings.autoDeleteRetryAttempts,
    retryBaseSeconds: settings.autoDeleteRetryBaseSeconds,
    retryMaxSeconds: settings.autoDeleteRetryMaxSeconds,
    workerConcurrency: settings.autoDeleteWorkerConcurrency,
    metricsLogIntervalSeconds: settings.autoDeleteMetricsLogIntervalSeconds,
  });
  startAutoDeleteService(bot.api);
}

async function shutdownInfra() {
  stopAutoDeleteService();
  await stopGroupCache();
  await closeMongo();
}

function createBot() {
  const bot = new Bot(settings.botToken);
  registerStartHandlers(bot);
  registerOwnerHandlers(bot);
  registerPaymentReviewHandlers(bot);
  registerGroupSetupHandlers(bot);
  registerAutoDeleteHandlers(bot);
  return bot;
}

async function runPolling() {
  const bot = createBot();
  await startupInfra(bot);
  console.log('[Bot] Starting polling mode...');

  process.once('SIGINT', async () => {
    await bot.stop();
    await shutdownInfra();
    process.exit(0);
  });
  process.once('SIGTERM', async () => {
    await bot.stop();
    await shutdownInfra();
    process.exit(0);
  });

  await bot.start({ onStart: () => console.log('[Bot] Polling started') });
}

async function runWebhook() {
  const webhookUrl = settings.webhookUrl;
  if (!webhookUrl) {
    throw new Error('WEBHOOK_MODE=true requires WEBHOOK_BASE_URL to be set.');
  }

  const bot = createBot();
  await startupInfra(bot);

  // Set webhook with Telegram
  await bot.api.setWebhook(webhookUrl, {
    secret_token: settings.webhookSecretToken || undefined,
    drop_pending_updates: false,
  });
  console.log(`[Bot] Webhook set to: ${webhookUrl}`);

  const fastify = Fastify({ logger: false });

  fastify.get('/healthz', async () => ({ status: 'ok' }));

  const webhookHandler = webhookCallback(bot, 'fastify', {
    secretToken: settings.webhookSecretToken || undefined,
  });

  fastify.post(settings.normalizedWebhookPath, webhookHandler);

  const graceful = async () => {
    await fastify.close();
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await shutdownInfra();
    process.exit(0);
  };
  process.once('SIGINT', graceful);
  process.once('SIGTERM', graceful);

  await fastify.listen({ port: settings.port, host: settings.webServerHost });
  console.log(`[Bot] Webhook server listening on ${settings.webServerHost}:${settings.port}`);
}

async function main() {
  try {
    if (settings.resolvedRunMode === 'webhook') {
      await runWebhook();
    } else {
      await runPolling();
    }
  } catch (err) {
    console.error('[Bot] Fatal startup error:', err.message);
    process.exit(1);
  }
}

main();
