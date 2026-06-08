const { config } = require('./config');

async function postJson(path, body) {
  const url = `${config.klolBaseUrl}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-discord-bot-secret': config.discordBotApiSecret,
      Authorization: `Bearer ${config.discordBotApiSecret}`,
    },
    body: JSON.stringify({
      secret: config.discordBotApiSecret,
      ...body,
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, raw: text };
  }

  if (!response.ok) {
    const preview = JSON.stringify(data).slice(0, 1600);
    throw new Error(`${path} 요청 실패: HTTP ${response.status} ${preview}`);
  }

  return data;
}

async function saveVoiceStateEvent(payload) {
  return postJson('/api/discord/voice-state', payload);
}

async function checkRecruitAutoFinish(payload) {
  return postJson('/api/discord/recruits/auto-finish/check', payload);
}

module.exports = {
  postJson,
  saveVoiceStateEvent,
  checkRecruitAutoFinish,
};
