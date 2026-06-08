const { config, isWatchedChannel, isIgnoredChannel } = require('./config');

const recentChannelMap = new Map();

function rememberChannel(channel, reason = 'UNKNOWN') {
  if (!channel || !channel.id) return;
  const channelId = String(channel.id);
  if (isIgnoredChannel(channelId)) return;
  if (!isWatchedChannel(channel)) return;

  recentChannelMap.set(channelId, {
    channelId,
    name: channel.name || '',
    parentId: channel.parentId || null,
    lastSeenAt: Date.now(),
    reason,
  });
}

function rememberChannelId(channelId, reason = 'UNKNOWN') {
  channelId = String(channelId || '').trim();
  if (!channelId || isIgnoredChannel(channelId)) return;
  const previous = recentChannelMap.get(channelId) || { channelId, name: '', parentId: null };
  recentChannelMap.set(channelId, {
    ...previous,
    lastSeenAt: Date.now(),
    reason,
  });
}

function cleanupRecentChannels() {
  const now = Date.now();
  for (const [channelId, entry] of recentChannelMap.entries()) {
    if (now - entry.lastSeenAt > config.recentDynamicChannelTtlMs) {
      recentChannelMap.delete(channelId);
    }
  }
}

function getRecentChannelIds() {
  cleanupRecentChannels();
  return [...recentChannelMap.keys()];
}

async function getConfiguredVoiceChannels(client) {
  const ids = new Set(config.watchChannelIds);

  if (config.watchAllVoiceChannels || config.watchCategoryIds.length > 0) {
    for (const guild of client.guilds.cache.values()) {
      const channels = await guild.channels.fetch().catch(() => null);
      if (!channels) continue;

      for (const channel of channels.values()) {
        if (!channel || !channel.isVoiceBased || !channel.isVoiceBased()) continue;
        if (isWatchedChannel(channel)) {
          ids.add(String(channel.id));
          rememberChannel(channel, 'CONFIG_SCAN');
        }
      }
    }
  }

  for (const channelId of getRecentChannelIds()) {
    ids.add(channelId);
  }

  for (const channelId of config.ignoreChannelIds) {
    ids.delete(channelId);
  }

  return [...ids];
}

module.exports = {
  rememberChannel,
  rememberChannelId,
  getRecentChannelIds,
  getConfiguredVoiceChannels,
};
