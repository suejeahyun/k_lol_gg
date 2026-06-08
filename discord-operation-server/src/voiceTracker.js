const { saveVoiceStateEvent } = require('./apiClient');
const { config, isWatchedChannel, isIgnoredChannel } = require('./config');
const { sendAdminText } = require('./adminLog');
const { rememberChannel, rememberChannelId } = require('./channelRegistry');
const { checkChannel } = require('./recruitMonitor');

function getVoiceEventType(oldChannelId, newChannelId) {
  if (!oldChannelId && newChannelId) return 'JOIN';
  if (oldChannelId && !newChannelId) return 'LEAVE';
  return 'MOVE';
}

function isWatchedVoiceChange(oldState, newState) {
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  if (isIgnoredChannel(oldChannelId) || isIgnoredChannel(newChannelId)) return false;
  if (isWatchedChannel(oldChannel) || isWatchedChannel(newChannel)) return true;

  // 이미 최근에 감지된 임시방이면 삭제/퇴장 후에도 추적한다.
  if (config.dynamicVoiceWatch) {
    if (oldChannelId) rememberChannelId(oldChannelId, 'VOICE_CHANGE_OLD');
    if (newChannelId) rememberChannelId(newChannelId, 'VOICE_CHANGE_NEW');
  }

  return false;
}

function buildPayload(oldState, newState, eventType) {
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  const member = newState.member || oldState.member || null;
  const user = member?.user || null;

  return {
    discordId: newState.id || oldState.id,
    eventType,
    channelId: newState.channelId || null,
    previousChannelId: oldState.channelId || null,
    guildId: newState.guild?.id || oldState.guild?.id || null,

    channelName: newChannel?.name || null,
    previousChannelName: oldChannel?.name || null,
    categoryId: newChannel?.parentId || null,
    previousCategoryId: oldChannel?.parentId || null,
    categoryName: newChannel?.parent?.name || null,
    previousCategoryName: oldChannel?.parent?.name || null,

    // 서버에서 바꾼 닉네임 기준 표시값.
    // Discord globalName/username보다 member.displayName이 서버 표시명에 가장 가깝다.
    memberDisplayName: member?.displayName || null,
    memberNickname: member?.nickname || null,
    discordUsername: user?.username || null,
    discordGlobalName: user?.globalName || null,
  };
}

function registerVoiceTracker(client) {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (oldChannelId === newChannelId) return;
    if (!isWatchedVoiceChange(oldState, newState)) return;

    if (oldState.channel) rememberChannel(oldState.channel, 'VOICE_OLD');
    if (newState.channel) rememberChannel(newState.channel, 'VOICE_NEW');

    const eventType = getVoiceEventType(oldChannelId, newChannelId);
    const payload = buildPayload(oldState, newState, eventType);

    try {
      const saved = await saveVoiceStateEvent(payload);

      if (config.logVoiceEvents) {
        console.log(`[VOICE:${eventType}] discordId=${payload.discordId} ${oldChannelId || '-'} -> ${newChannelId || '-'} eventId=${saved.eventId || '-'}`);
      }

      // 임시방은 비면 빠르게 삭제될 수 있으므로 LEAVE/MOVE 직후 이전 채널 기준으로 즉시 자동 ㅉ 후보를 갱신한다.
      if (config.checkOnVoiceLeave && config.autoFinishEnabled && oldChannelId && (eventType === 'LEAVE' || eventType === 'MOVE')) {
        await checkChannel(client, oldChannelId, {
          source: `VOICE_${eventType}`,
          channelName: oldState.channel?.name || null,
          categoryId: oldState.channel?.parentId || null,
        }).catch((error) => {
          console.error('[KLOL_AUTO_FINISH_AFTER_VOICE_ERROR]', error);
        });
      }
    } catch (error) {
      console.error('[KLOL_VOICE_STATE_SAVE_ERROR]', error);
      await sendAdminText(
        client,
        `[K-LOL.GG 디스코드 봇 오류]\n음성 이벤트 저장 실패\n이벤트: ${eventType}\n유저: ${payload.discordId}\n${String(error).slice(0, 1500)}`,
      );
    }
  });
}

module.exports = {
  registerVoiceTracker,
};
