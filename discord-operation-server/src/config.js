const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function toBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
  discordBotApiSecret: process.env.DISCORD_BOT_API_SECRET || '',
  klolBaseUrl: String(process.env.KLOL_BASE_URL || 'https://k-lol-gg.vercel.app').replace(/\/$/, ''),

  // v1: fixed channel watch list.
  watchChannelIds: parseCsv(process.env.DISCORD_WATCH_CHANNEL_IDS),

  // v2: dynamic temporary voice channels.
  watchAllVoiceChannels: toBool(process.env.DISCORD_WATCH_ALL_VOICE_CHANNELS, false),
  dynamicVoiceWatch: toBool(process.env.DISCORD_DYNAMIC_VOICE_WATCH, true),
  watchCategoryIds: parseCsv(process.env.DISCORD_WATCH_CATEGORY_IDS),
  ignoreChannelIds: parseCsv(process.env.DISCORD_IGNORE_CHANNEL_IDS),
  recentDynamicChannelTtlMs: toNumber(process.env.DISCORD_DYNAMIC_CHANNEL_TTL_MS, 6 * 60 * 60 * 1000),

  adminLogChannelId: String(process.env.DISCORD_ADMIN_LOG_CHANNEL_ID || '').trim(),
  checkIntervalMs: toNumber(process.env.DISCORD_CHECK_INTERVAL_MS, 60_000),
  holdMinutes: toNumber(process.env.DISCORD_AUTO_FINISH_HOLD_MINUTES, 10),
  dryRun: toBool(process.env.DISCORD_AUTO_FINISH_DRY_RUN, false),
  autoFinishEnabled: toBool(process.env.DISCORD_AUTO_FINISH_ENABLED, true),
  logVoiceEvents: toBool(process.env.DISCORD_LOG_VOICE_EVENTS, true),
  statusLogIntervalMs: toNumber(process.env.DISCORD_STATUS_LOG_INTERVAL_MS, 300_000),
  checkOnVoiceLeave: toBool(process.env.DISCORD_CHECK_ON_VOICE_LEAVE, true),
};

function validateConfig() {
  const missing = [];
  if (!config.discordBotToken) missing.push('DISCORD_BOT_TOKEN');
  if (!config.discordBotApiSecret) missing.push('DISCORD_BOT_API_SECRET');
  if (!config.klolBaseUrl) missing.push('KLOL_BASE_URL');

  const hasWatchSource = config.watchAllVoiceChannels
    || config.watchChannelIds.length > 0
    || config.watchCategoryIds.length > 0;

  if (!hasWatchSource) {
    missing.push('DISCORD_WATCH_CHANNEL_IDS 또는 DISCORD_WATCH_CATEGORY_IDS 또는 DISCORD_WATCH_ALL_VOICE_CHANNELS=true');
  }

  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 비어 있습니다: ${missing.join(', ')}`);
  }
}

function isIgnoredChannel(channelId) {
  return config.ignoreChannelIds.includes(String(channelId || ''));
}

function isWatchedChannel(channel) {
  if (!channel) return false;
  const channelId = String(channel.id || '');
  if (!channelId || isIgnoredChannel(channelId)) return false;

  if (config.watchAllVoiceChannels) return true;
  if (config.watchChannelIds.includes(channelId)) return true;
  if (channel.parentId && config.watchCategoryIds.includes(String(channel.parentId))) return true;

  return false;
}

module.exports = {
  config,
  validateConfig,
  isWatchedChannel,
  isIgnoredChannel,
};
