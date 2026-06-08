/*
  K-LOL.GG Discord 자동 ㅉ/음성 감지 봇

  설치:
    npm init -y
    npm i discord.js dotenv

  실행:
    node discord-auto-finish-bot.js

  역할:
    1. 감시 대상 음성방 JOIN / MOVE / LEAVE 이벤트를 사이트 DB에 저장
    2. 진행중 구인의 참가자 전원 퇴장 여부를 주기적으로 사이트 API에 확인
    3. 조건 충족 시 사이트가 자동 ㅉ 처리
    4. 운영진 로그 채널에만 상세 결과 출력
*/
require('dotenv').config({ quiet: false });
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

const API_BASE_URL = String(process.env.KLOL_BASE_URL || 'https://k-lol-gg.vercel.app').replace(/\/$/, '');
const SECRET = process.env.DISCORD_BOT_API_SECRET;
const WATCH_CHANNEL_IDS = String(process.env.DISCORD_WATCH_CHANNEL_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CHECK_INTERVAL_MS = Number(process.env.DISCORD_CHECK_INTERVAL_MS || 60_000);
const HOLD_MINUTES = Number(process.env.DISCORD_AUTO_FINISH_HOLD_MINUTES || 10);
const ADMIN_LOG_CHANNEL_ID = String(process.env.DISCORD_ADMIN_LOG_CHANNEL_ID || '').trim();
const LOG_VOICE_EVENTS = String(process.env.DISCORD_LOG_VOICE_EVENTS || 'false').toLowerCase() === 'true';

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('[K-LOL.GG Discord Bot] DISCORD_BOT_TOKEN이 필요합니다.');
  process.exit(1);
}

if (!SECRET) {
  console.error('[K-LOL.GG Discord Bot] DISCORD_BOT_API_SECRET이 필요합니다. 사이트 환경변수와 같은 값이어야 합니다.');
  process.exit(1);
}

if (WATCH_CHANNEL_IDS.length === 0) {
  console.error('[K-LOL.GG Discord Bot] DISCORD_WATCH_CHANNEL_IDS가 비어 있습니다. 감시할 음성채널 ID를 쉼표로 넣어주세요.');
  process.exit(1);
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-discord-bot-secret': SECRET,
    },
    body: JSON.stringify({ secret: SECRET, ...body }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, raw: text };
  }
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  return data;
}

async function sendAdminText(message) {
  if (!ADMIN_LOG_CHANNEL_ID) return;
  const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return;
  await channel.send(message).catch(console.error);
}

async function sendAdminEmbed(embed) {
  if (!ADMIN_LOG_CHANNEL_ID) return;
  const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return;
  await channel.send({ embeds: [embed] }).catch(console.error);
}

function getVoiceEventType(oldChannelId, newChannelId) {
  if (!oldChannelId && newChannelId) return 'JOIN';
  if (oldChannelId && !newChannelId) return 'LEAVE';
  return 'MOVE';
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  const watched = WATCH_CHANNEL_IDS.includes(String(oldChannelId || '')) || WATCH_CHANNEL_IDS.includes(String(newChannelId || ''));
  if (!watched) return;

  const eventType = getVoiceEventType(oldChannelId, newChannelId);
  const discordId = newState.id || oldState.id;

  try {
    const saved = await postJson('/api/discord/voice-state', {
      discordId,
      eventType,
      channelId: newChannelId,
      previousChannelId: oldChannelId,
    });

    if (LOG_VOICE_EVENTS) {
      console.log(`[VOICE:${eventType}] ${discordId} ${oldChannelId || '-'} -> ${newChannelId || '-'} eventId=${saved.eventId}`);
    }
  } catch (error) {
    console.error('[KLOL_VOICE_STATE_SAVE_ERROR]', error);
    await sendAdminText(`[K-LOL.GG 디스코드 봇 오류]\n음성 이벤트 저장 실패\n${String(error).slice(0, 1500)}`);
  }
});

async function checkAutoFinishForChannel(channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.members) {
    return { ok: false, channelId, skipped: true, reason: 'CHANNEL_NOT_FOUND_OR_NOT_VOICE' };
  }

  const currentDiscordIds = [...channel.members.keys()];
  const result = await postJson('/api/discord/recruits/auto-finish/check', {
    channelId,
    currentDiscordIds,
    holdMinutes: HOLD_MINUTES,
  });

  if (result && Array.isArray(result.finished) && result.finished.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle('K-LOL.GG 구인 자동 마감')
      .setDescription(result.finished.map((item) => `• ${item}`).join('\n'))
      .addFields(
        { name: '감지 음성방', value: `<#${channelId}>`, inline: true },
        { name: '기준', value: `참가자 전원 퇴장 후 ${HOLD_MINUTES}분 유지`, inline: true },
        { name: '카톡 안내 문구', value: result.kakaoReply ? `\`\`\`\n${String(result.kakaoReply).slice(0, 900)}\n\`\`\`` : '없음' },
      )
      .setTimestamp(new Date());
    await sendAdminEmbed(embed);
    console.log('[KLOL_AUTO_FINISH]
' + result.kakaoReply);
  }

  return result;
}

let checking = false;
async function checkAutoFinish() {
  if (checking) return;
  checking = true;
  try {
    for (const channelId of WATCH_CHANNEL_IDS) {
      try {
        await checkAutoFinishForChannel(channelId);
      } catch (error) {
        console.error('[KLOL_AUTO_FINISH_CHECK_ERROR]', channelId, error);
        await sendAdminText(`[K-LOL.GG 디스코드 봇 오류]\n자동 마감 확인 실패\n채널: ${channelId}\n${String(error).slice(0, 1500)}`);
      }
    }
  } finally {
    checking = false;
  }
}

client.once('clientReady', () => {
  console.log(`[K-LOL.GG Discord Bot] logged in as ${client.user.tag}`);
  console.log(`[K-LOL.GG Discord Bot] API_BASE_URL=${API_BASE_URL}`);
  console.log(`[K-LOL.GG Discord Bot] WATCH_CHANNEL_IDS=${WATCH_CHANNEL_IDS.join(', ')}`);
  console.log(`[K-LOL.GG Discord Bot] ADMIN_LOG_CHANNEL_ID=${ADMIN_LOG_CHANNEL_ID || '(not set)'}`);
  setInterval(() => void checkAutoFinish(), CHECK_INTERVAL_MS);
  void checkAutoFinish();
});

client.login(process.env.DISCORD_BOT_TOKEN);
