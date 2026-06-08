const { EmbedBuilder } = require('discord.js');
const { config } = require('./config');

async function sendAdminText(client, text) {
  if (!config.adminLogChannelId) return;
  const channel = await client.channels.fetch(config.adminLogChannelId).catch(() => null);
  if (!channel || !channel.send) return;
  await channel.send(String(text).slice(0, 1900));
}

async function sendAdminEmbed(client, embed) {
  if (!config.adminLogChannelId) return;
  const channel = await client.channels.fetch(config.adminLogChannelId).catch(() => null);
  if (!channel || !channel.send) return;
  await channel.send({ embeds: [embed] });
}

function createAutoFinishEmbed(channelId, result) {
  const finished = Array.isArray(result.finished) ? result.finished : [];
  const lines = finished.length > 0 ? finished.join('\n') : '자동 마감 없음';
  return new EmbedBuilder()
    .setTitle('K-LOL.GG 자동 ㅉ 처리')
    .setDescription(lines)
    .addFields(
      { name: '감지 채널', value: String(channelId), inline: false },
      { name: '카카오 안내', value: String(result.kakaoReply || '-').slice(0, 900), inline: false },
    )
    .setTimestamp(new Date());
}

module.exports = {
  sendAdminText,
  sendAdminEmbed,
  createAutoFinishEmbed,
};
