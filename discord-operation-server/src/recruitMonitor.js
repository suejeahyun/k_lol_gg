const { checkRecruitAutoFinish } = require('./apiClient');
const { config } = require('./config');
const { sendAdminText, sendAdminEmbed, createAutoFinishEmbed } = require('./adminLog');
const { getConfiguredVoiceChannels, rememberChannelId } = require('./channelRegistry');

async function getVoiceChannel(client, channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.members || !channel.isVoiceBased || !channel.isVoiceBased()) return null;
  return channel;
}

async function checkChannel(client, channelId, options = {}) {
  const channel = await getVoiceChannel(client, channelId);
  const currentDiscordIds = channel ? [...channel.members.keys()] : [];

  if (channel) {
    rememberChannelId(channel.id, 'AUTO_FINISH_CHECK');
  }

  const result = await checkRecruitAutoFinish({
    channelId,
    currentDiscordIds,
    holdMinutes: config.holdMinutes,
    dryRun: config.dryRun,
    source: options.source || 'INTERVAL',
    channelName: channel?.name || options.channelName || null,
    categoryId: channel?.parentId || options.categoryId || null,
    channelMissing: !channel,
  });

  if (Array.isArray(result.finished) && result.finished.length > 0) {
    console.log(`[KLOL_AUTO_FINISH] channel=${channelId} finished=${result.finished.join(', ')}`);
    await sendAdminEmbed(client, createAutoFinishEmbed(channelId, result));
  }

  return result;
}

function summarizeResult(result) {
  const results = Array.isArray(result.results) ? result.results : [];
  const total = results.length;
  const active = results.filter((item) => item.status === 'ACTIVE').length;
  const candidate = results.filter((item) => item.status === 'FINISH_CANDIDATE').length;
  const finished = results.filter((item) => item.status === 'AUTO_FINISHED').length;
  const skipped = results.filter((item) => item.skipped).length;
  return { total, active, candidate, finished, skipped };
}

async function runAutoFinishSweep(client, source = 'INTERVAL') {
  const channelIds = await getConfiguredVoiceChannels(client);
  const uniqueChannelIds = [...new Set(channelIds)];

  for (const channelId of uniqueChannelIds) {
    try {
      const result = await checkChannel(client, channelId, { source });
      const summary = summarizeResult(result);
      console.log(`[AUTO_FINISH_CHECK] source=${source} channel=${channelId} total=${summary.total} active=${summary.active} candidate=${summary.candidate} finished=${summary.finished} skipped=${summary.skipped}`);
    } catch (error) {
      console.error('[KLOL_AUTO_FINISH_CHECK_ERROR]', channelId, error);
      await sendAdminText(
        client,
        `[K-LOL.GG 디스코드 봇 오류]\n자동 마감 확인 실패\n채널: ${channelId}\n${String(error).slice(0, 1500)}`,
      );
    }
  }
}

function startRecruitMonitor(client) {
  if (!config.autoFinishEnabled) {
    console.log('[K-LOL.GG Discord Bot] 자동 ㅉ 모니터가 비활성화되어 있습니다.');
    return;
  }

  let checking = false;

  async function runOnce() {
    if (checking) return;
    checking = true;
    try {
      await runAutoFinishSweep(client, 'INTERVAL');
    } finally {
      checking = false;
    }
  }

  setInterval(() => void runOnce(), config.checkIntervalMs);
  void runOnce();
}

module.exports = {
  startRecruitMonitor,
  checkChannel,
  runAutoFinishSweep,
};
