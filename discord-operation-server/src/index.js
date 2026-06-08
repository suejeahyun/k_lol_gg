const { Client, GatewayIntentBits } = require('discord.js');
const { config, validateConfig } = require('./config');
const { registerVoiceTracker } = require('./voiceTracker');
const { startRecruitMonitor } = require('./recruitMonitor');
const { sendAdminText } = require('./adminLog');

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

registerVoiceTracker(client);

client.once('clientReady', async () => {
  console.log(`[K-LOL.GG Discord Bot] logged in as ${client.user.tag}`);
  console.log(`[K-LOL.GG Discord Bot] KLOL_BASE_URL=${config.klolBaseUrl}`);
  console.log(`[K-LOL.GG Discord Bot] WATCH_ALL=${config.watchAllVoiceChannels ? 'ON' : 'OFF'}`);
  console.log(`[K-LOL.GG Discord Bot] WATCH_CHANNEL_IDS=${config.watchChannelIds.join(', ') || '(none)'}`);
  console.log(`[K-LOL.GG Discord Bot] WATCH_CATEGORY_IDS=${config.watchCategoryIds.join(', ') || '(none)'}`);
  console.log(`[K-LOL.GG Discord Bot] IGNORE_CHANNEL_IDS=${config.ignoreChannelIds.join(', ') || '(none)'}`);
  console.log(`[K-LOL.GG Discord Bot] ADMIN_LOG_CHANNEL_ID=${config.adminLogChannelId || '(not set)'}`);
  console.log(`[K-LOL.GG Discord Bot] AUTO_FINISH=${config.autoFinishEnabled ? 'ON' : 'OFF'} / DRY_RUN=${config.dryRun ? 'ON' : 'OFF'} / HOLD=${config.holdMinutes}min`);

  await sendAdminText(
    client,
    `[K-LOL.GG 디스코드 운영 서버 v2 시작]\n봇: ${client.user.tag}\n전체 음성방 감시: ${config.watchAllVoiceChannels ? 'ON' : 'OFF'}\n고정 채널: ${config.watchChannelIds.length}개\n카테고리: ${config.watchCategoryIds.length}개\n자동 ㅉ: ${config.autoFinishEnabled ? 'ON' : 'OFF'}\nDRY RUN: ${config.dryRun ? 'ON' : 'OFF'}`,
  );

  startRecruitMonitor(client);

  setInterval(() => {
    const guildCount = client.guilds.cache.size;
    console.log(`[K-LOL.GG Discord Bot] alive guilds=${guildCount} uptime=${Math.floor(process.uptime())}s`);
  }, config.statusLogIntervalMs);
});

client.on('error', (error) => {
  console.error('[DISCORD_CLIENT_ERROR]', error);
});

client.on('warn', (message) => {
  console.warn('[DISCORD_CLIENT_WARN]', message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT_EXCEPTION]', error);
});

async function shutdown(signal) {
  console.log(`[K-LOL.GG Discord Bot] shutdown requested: ${signal}`);
  await sendAdminText(client, `[K-LOL.GG 디스코드 운영 서버 종료]\n사유: ${signal}`).catch(() => {});
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

client.login(config.discordBotToken);
