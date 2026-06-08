/*
  K-LOL.GG Discord 자동 ㅉ 감지 봇 샘플
  설치: npm i discord.js dotenv
  실행: node discord-auto-finish-bot.js
*/
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

const API_BASE_URL = process.env.KLOL_BASE_URL || 'https://k-lol-gg.vercel.app';
const SECRET = process.env.DISCORD_BOT_API_SECRET;
const WATCH_CHANNEL_IDS = String(process.env.DISCORD_WATCH_CHANNEL_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CHECK_INTERVAL_MS = Number(process.env.DISCORD_CHECK_INTERVAL_MS || 60_000);
const HOLD_MINUTES = Number(process.env.DISCORD_AUTO_FINISH_HOLD_MINUTES || 10);

async function postJson(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-discord-bot-secret': SECRET,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, raw: text, status: res.status }; }
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  const watched = WATCH_CHANNEL_IDS.includes(String(oldChannelId || '')) || WATCH_CHANNEL_IDS.includes(String(newChannelId || ''));
  if (!watched) return;

  let eventType = 'MOVE';
  if (!oldChannelId && newChannelId) eventType = 'JOIN';
  if (oldChannelId && !newChannelId) eventType = 'LEAVE';

  await postJson('/api/discord/voice-state', {
    discordId: newState.id,
    eventType,
    channelId: newChannelId,
    previousChannelId: oldChannelId,
  }).catch(console.error);
});

async function checkAutoFinish() {
  for (const channelId of WATCH_CHANNEL_IDS) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.members) continue;

    const currentDiscordIds = [...channel.members.keys()];
    const result = await postJson('/api/discord/recruits/auto-finish/check', {
      channelId,
      currentDiscordIds,
      holdMinutes: HOLD_MINUTES,
    }).catch((error) => ({ ok: false, error: String(error) }));

    if (result && result.kakaoReply) {
      // 카카오톡 전송은 현재 사용 중인 카카오봇 구조에 맞춰 별도 처리.
      // 우선 운영 콘솔에 출력해 확인한다.
      console.log('[KLOL_AUTO_FINISH_KAKAO_REPLY]\n' + result.kakaoReply);
    }
  }
}

client.once('ready', () => {
  console.log(`[K-LOL.GG Discord Bot] logged in as ${client.user.tag}`);
  setInterval(() => void checkAutoFinish(), CHECK_INTERVAL_MS);
  void checkAutoFinish();
});

client.login(process.env.DISCORD_BOT_TOKEN);
