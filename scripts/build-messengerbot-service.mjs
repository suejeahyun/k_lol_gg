// Service-specific phone builds keep the existing server wire contract. Only
// credentials, persistent phone state, visible links and subscribed rooms vary.
export function messengerbotService(args = process.argv.slice(2)) {
  if (args.length === 0) return "klol";
  if (args.length === 2 && args[0] === "--service" && ["klol", "nexus"].includes(args[1])) return args[1];
  throw new Error("Usage: --service klol|nexus (default: klol)");
}

export const nexusSettingKeys = [
  "NEXUS_V2_BASE_URL", "NEXUS_V4_KAKAO_IDENTITY_SECRET",
  "NEXUS_V4_KAKAO_WEBHOOK_SECRET_CURRENT", "NEXUS_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT",
];

export function nexusPrivateSettings(environment) {
  const entries = nexusSettingKeys.map((key) => [key, String(environment[key] || "").trim()]);
  const values = Object.fromEntries(entries);
  if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/u.test(values.NEXUS_V2_BASE_URL)) {
    throw new Error("NEXUS_V2_BASE_URL must explicitly name the NEXUS HTTPS origin");
  }
  if (new URL(values.NEXUS_V2_BASE_URL).origin === "https://k-lol-gg.vercel.app") throw new Error("NEXUS must not use the K-LOL production origin");
  const identity = values.NEXUS_V4_KAKAO_IDENTITY_SECRET;
  const signing = values.NEXUS_V4_KAKAO_WEBHOOK_SECRET_CURRENT;
  if ([identity, signing].some((value) => Buffer.byteLength(value) < 32 || Buffer.byteLength(value) > 1024) || identity === signing) {
    throw new Error("NEXUS requires distinct identity and signing secrets of 32–1024 bytes");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(values.NEXUS_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT)) throw new Error("NEXUS signing key ID is required");
  for (const [key, value] of entries) {
    if (key.endsWith("SECRET") || key.endsWith("SECRET_CURRENT")) {
      const existing = environment[key.replace(/^NEXUS_/u, "KLOL_")];
      if (existing && existing === value) throw new Error("NEXUS credentials must be independent from K-LOL credentials");
    }
  }
  return entries;
}

export function nexusPrivatePreamble(entries) {
  return entries.map(([key, value]) => `DataBase.setDataBase(${JSON.stringify(key)},${JSON.stringify(value)});`).join("\n") + "\n";
}

const nexusDatabase = [
  "var NEXUS_DB={",
  "getDataBase:function(key){return DataBase.getDataBase(\"NEXUS_\"+String(key).replace(/^KLOL_/,\"\"));},",
  "setDataBase:function(key,value){DataBase.setDataBase(\"NEXUS_\"+String(key).replace(/^KLOL_/,\"\"),value);}",
  "};",
].join("\n");

export const klolMainRoomGuard = 'if(String(packageName)!=="com.kakao.talk"||!/^(LOL-K|K롤방구인구직방)$/.test(String(room).replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g,"")))return;';
export const klolNoticeRoomGuard = 'if(String(packageName)!=="com.kakao.talk"||!/^K롤방구인구직방$/.test(String(room).replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g,"")))return;';
export const nexusMainRoomGuard = 'if(String(packageName)!=="com.kakao.talk"||!/^(NEXUS|NEXUS구인구직방)$/.test(String(room).replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g,"")))return;';
export const nexusNoticeRoomGuard = 'if(String(packageName)!=="com.kakao.talk"||!/^NEXUS구인구직방$/.test(String(room).replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g,"")))return;';

function replaceResponseRoomGuard(source, expected, replacement) {
  const entry = /function response\([^\n]+\) \{\n/u.exec(source);
  if (!entry) throw new Error("Phone response entry missing");
  const start = entry.index + entry[0].length;
  const end = source.indexOf("\n", start);
  if (source.slice(start, end).trim() !== expected) throw new Error("Phone response must start with the expected room allowlist");
  return source.slice(0, start) + replacement + source.slice(end);
}

export function nexusMessengerbotSource(klolSource) {
  const marker = "var KLOL_V1_GATEWAY =";
  const start = klolSource.indexOf(marker);
  if (start < 0) throw new Error("K-LOL transport marker missing");
  let source = replaceResponseRoomGuard(klolSource.slice(start), klolMainRoomGuard, nexusMainRoomGuard + '\nif(!nexusConfigureLinks())return;')
    .replace(/\bDataBase\./gu, "NEXUS_DB.")
    .replaceAll("K-LOL.GG", "NEXUS.GG").replaceAll("K-LOL", "NEXUS")
    .replaceAll("[KLOL_DIAG]", "[NEXUS_DIAG]").replaceAll("LOL-K 기능", "NEXUS 기능")
    .replaceAll("K롤방 구인구직방", "NEXUS 구인구직방")
    .replaceAll('"event-log-"', '"event-nexus-log-"')
    .replaceAll('"event-boot-"', '"event-nexus-boot-"')
    .replace('var BASE_URL="https://k-lol-gg.vercel.app";', 'var BASE_URL="";')
    .replaceAll("KLOL_KAKAO_BOT_V40_R31_2026_10_27", "NEXUS_KAKAO_BOT_V40_R31_2026_10_27");
  // The new community has no approved invite links or entry code. Refer to its
  // own configured site instead of silently retaining K-LOL invites.
  source = source.replace(/sourceReplier\.reply\(joinTone\[0\] \+ .*? \+ joinTone\[1\]\);/u,
    'sourceReplier.reply(joinTone[0]+"\\n\\nNEXUS 구인구직방에서 모집·참가해주세요.\\n사이트: "+BASE_URL+"\\n\\n"+joinTone[1]);');
  if (source.includes("https://k-lol-gg.vercel.app") || source.includes("open.kakao.com/o/gAxaVdxh") || source.includes("discord.gg/k-lol")) {
    throw new Error("NEXUS bot must not retain K-LOL site or invite links");
  }
  const configuration = [
    "function nexusConfigureLinks(){",
    "try{",
    'var url=String(NEXUS_DB.getDataBase("KLOL_V2_BASE_URL")||"").replace(/\\/+$/,"");',
    'var identity=String(NEXUS_DB.getDataBase("KLOL_V4_KAKAO_IDENTITY_SECRET")||"");',
    'var signing=String(NEXUS_DB.getDataBase("KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT")||"");',
    'var keyId=String(NEXUS_DB.getDataBase("KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT")||"");',
    'if(!/^https:\\/\\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(url)||identity.length<32||signing.length<32||identity===signing||!/^[A-Za-z0-9._:-]{1,128}$/.test(keyId))return false;',
    'if(url.toLowerCase().replace(/:443$/,"")==="https://"+"k-lol-gg.vercel.app")return false;',
    'BASE_URL=url;',
    'WEB_INHOUSE_RESULT_UPLOAD_URL=url+"/matches/submit";',
    'WEB_ADMIN_DISCIPLINE_CREATE_URL=url+"/admin/discipline/new";',
    'WEB_DISCIPLINE_EVIDENCE_URL=url+"/discipline/evidence";',
    'WEB_REGISTRATION_HUB_URL=url+"/start";',
    'WEB_ACCOUNT_DISCIPLINE_URL=url+"/account#discipline";',
    'return true;',
    '}catch(ignoredNexusConfiguration){return false;}',
    '}',
  ].join("\n");
  return `${nexusDatabase}\n${source}\n${configuration}\n`;
}

export function nexusCompanionSource(klolSource) {
  const source = replaceResponseRoomGuard(klolSource.replace(/\r\n?/gu, "\n"), klolNoticeRoomGuard, `  ${nexusNoticeRoomGuard}`)
    .replace(/\bDataBase\./gu, "NEXUS_DB.")
    .replaceAll('"KLOL_SITE_NOTICE_COMPANION_1.0.4"', '"NEXUS_SITE_NOTICE_COMPANION_1.0.4"');
  return `${nexusDatabase}\n${source}`;
}
