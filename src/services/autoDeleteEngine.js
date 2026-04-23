'use strict';

const settings = require('../config/settings');

/**
 * High-performance in-memory auto-delete engine using a ring-buffer slot approach.
 * Ported 1-to-1 from the Python AutoDeleteEngine.
 */
class AutoDeleteEngine {
  constructor({
    deleteDelaySeconds = 45,
    tickIntervalMs = 200,
    maxBatchSize = 100,
    maxRetryAttempts = 5,
    retryBaseSeconds = 1.5,
    retryMaxSeconds = 45,
    workerConcurrency = 12,
    metricsLogIntervalSeconds = 60,
  } = {}) {
    this.deleteDelaySeconds = deleteDelaySeconds;
    this.tickIntervalMs = tickIntervalMs;
    this.maxBatchSize = maxBatchSize;
    this.maxRetryAttempts = maxRetryAttempts;
    this.retryBaseSeconds = retryBaseSeconds;
    this.retryMaxSeconds = retryMaxSeconds;
    this.workerConcurrency = workerConcurrency;
    this.metricsLogIntervalSeconds = metricsLogIntervalSeconds;

    const bufferWindowMs = (deleteDelaySeconds + retryMaxSeconds + 10) * 1000;
    this.bucketCount = Math.max(512, Math.ceil(bufferWindowMs / tickIntervalMs) + 1);

    // Ring buffer: each slot is a Map of "chatId:msgId" -> entry
    this.slots = Array.from({ length: this.bucketCount }, () => new Map());
    this.entries = new Map(); // key -> entry
    this.currentSlot = 0;

    this.metrics = {
      scheduled: 0,
      deleted: 0,
      failed: 0,
      duplicate: 0,
      stickerScheduled: 0,
      botContentScheduled: 0,
    };

    this.activeWorkers = 0;
    this.started = false;
    this.shuttingDown = false;
    this.bot = null;
    this.tickTimer = null;
    this.metricsTimer = null;
  }

  start(bot) {
    if (this.started) { this.bot = bot; return; }
    this.bot = bot;
    this.shuttingDown = false;
    this.currentSlot = this._slotForMs(Date.now());
    this.tickTimer = setInterval(() => this._tick(), this.tickIntervalMs);
    this.metricsTimer = setInterval(
      () => this._logMetrics(),
      this.metricsLogIntervalSeconds * 1000
    );
    this.started = true;
    console.log('[AutoDelete] Engine started');
  }

  stop() {
    this.shuttingDown = true;
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.metricsTimer) { clearInterval(this.metricsTimer); this.metricsTimer = null; }
    this.entries.clear();
    for (const slot of this.slots) slot.clear();
    this.started = false;
    console.log('[AutoDelete] Engine stopped');
  }

  scheduleDelete(bot, chatId, messageId, delaySeconds, kind = 'bot_content') {
    if (this.shuttingDown) return false;
    if (!this.started) this.start(bot);
    this.bot = bot;

    const key = `${chatId}:${messageId}`;
    if (this.entries.has(key)) { this.metrics.duplicate++; return false; }

    const dueAt = Date.now() + (delaySeconds ?? this.deleteDelaySeconds) * 1000;
    const entry = { chatId, messageId, dueAt, attempt: 0 };
    const slotIdx = this._slotForMs(dueAt);
    this.slots[slotIdx].set(key, entry);
    this.entries.set(key, entry);
    this.metrics.scheduled++;
    if (kind === 'sticker') this.metrics.stickerScheduled++;
    else this.metrics.botContentScheduled++;
    return true;
  }

  _slotForMs(ms) {
    return Math.floor(ms / this.tickIntervalMs) % this.bucketCount;
  }

  async _tick() {
    const now = Date.now();
    const slotEntries = this.slots[this.currentSlot];
    this.slots[this.currentSlot] = new Map();
    this.currentSlot = (this.currentSlot + 1) % this.bucketCount;

    const dueCutoff = now + this.tickIntervalMs / 2;
    const dueByChat = new Map();

    for (const [key, entry] of slotEntries) {
      if (entry.dueAt <= dueCutoff) {
        if (!dueByChat.has(entry.chatId)) dueByChat.set(entry.chatId, []);
        dueByChat.get(entry.chatId).push(entry);
      } else {
        const futureSlot = this._slotForMs(entry.dueAt);
        this.slots[futureSlot].set(key, entry);
      }
    }

    if (dueByChat.size === 0) return;

    const promises = [];
    for (const [chatId, entries] of dueByChat) {
      if (this.activeWorkers < this.workerConcurrency) {
        promises.push(this._processChatEntries(chatId, entries));
      }
    }
    await Promise.allSettled(promises);
  }

  async _processChatEntries(chatId, entries) {
    this.activeWorkers++;
    try {
      // Batch delete: collect message IDs
      const messageIds = entries.map((e) => e.messageId);

      // Delete in chunks of maxBatchSize
      for (let i = 0; i < messageIds.length; i += this.maxBatchSize) {
        const chunk = messageIds.slice(i, i + this.maxBatchSize);
        await this._deleteChunk(chatId, chunk, entries.slice(i, i + this.maxBatchSize));
      }
    } catch (err) {
      console.error(`[AutoDelete] Chat ${chatId} processing error:`, err.message);
    } finally {
      this.activeWorkers--;
    }
  }

  async _deleteChunk(chatId, messageIds, entries) {
    for (const entry of entries) {
      const key = `${entry.chatId}:${entry.messageId}`;
      try {
        await this.bot.api.deleteMessage(chatId, entry.messageId);
        this.entries.delete(key);
        this.metrics.deleted++;
      } catch (err) {
        const errDesc = err?.description || err?.message || '';
        const isRetryable =
          errDesc.includes('Too Many Requests') ||
          errDesc.includes('retry after') ||
          errDesc.includes('FLOOD_WAIT');

        if (isRetryable && entry.attempt < this.maxRetryAttempts) {
          const delay = Math.min(
            this.retryBaseSeconds * Math.pow(2, entry.attempt),
            this.retryMaxSeconds
          );
          const retryEntry = {
            chatId: entry.chatId,
            messageId: entry.messageId,
            dueAt: Date.now() + delay * 1000,
            attempt: entry.attempt + 1,
          };
          this.entries.set(key, retryEntry);
          const retrySlot = this._slotForMs(retryEntry.dueAt);
          this.slots[retrySlot].set(key, retryEntry);
        } else {
          // Message already deleted or permanent error — just remove
          this.entries.delete(key);
          if (!errDesc.includes('message to delete not found') &&
              !errDesc.includes("message can't be deleted")) {
            this.metrics.failed++;
          } else {
            this.metrics.deleted++; // already gone — count as deleted
          }
        }
      }
    }
  }

  _logMetrics() {
    console.log('[AutoDelete] Metrics:', {
      ...this.metrics,
      pending: this.entries.size,
    });
  }
}

// Singleton
let _engine = null;

function configureAutoDeleteService({
  deleteDelaySeconds,
  tickIntervalMs,
  maxBatchSize,
  maxRetryAttempts,
  retryBaseSeconds,
  retryMaxSeconds,
  workerConcurrency,
  metricsLogIntervalSeconds,
}) {
  _engine = new AutoDeleteEngine({
    deleteDelaySeconds,
    tickIntervalMs,
    maxBatchSize,
    maxRetryAttempts,
    retryBaseSeconds,
    retryMaxSeconds,
    workerConcurrency,
    metricsLogIntervalSeconds,
  });
}

function getAutoDeleteService() {
  if (!_engine) _engine = new AutoDeleteEngine();
  return _engine;
}

function startAutoDeleteService(bot) {
  getAutoDeleteService().start(bot);
}

function stopAutoDeleteService() {
  if (_engine) _engine.stop();
}

module.exports = {
  configureAutoDeleteService,
  getAutoDeleteService,
  startAutoDeleteService,
  stopAutoDeleteService,
};
