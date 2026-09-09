import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const routerPath = resolve(import.meta.dirname, "..", "integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_ROUTER.js");

async function harness() {
  const [compatibility, source] = await Promise.all([
    readFile(resolve(import.meta.dirname, "..", "integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V1_COMPAT.js"), "utf8"),
    readFile(routerPath, "utf8"),
  ]);
  const values = new Map();
  const replies = [];
  const calls = { season: [], images: [], records: [], recent: [], ranking: 0, notices: [], recruits: [], contexts: [] };
  let logSequence = 0;
  const context = vm.createContext({
    console,
    DataBase: {
      getDataBase(key) { return values.get(String(key)) ?? ""; },
      setDataBase(key, value) { values.set(String(key), String(value)); },
    },
    KLOL_V2_KAKAO: {
      userMessage(result) { return result?.ok ? "[K-LOL.GG]\n요청을 안전하게 처리했습니다." : "[K-LOL.GG 요청 실패]\n테스트 실패"; },
      identityForChat(room, sender) {
        const safe = (value) => String(value).replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "empty";
        return { roomId: `room-${safe(room)}`, senderId: `sender-${safe(sender)}` };
      },
      roomIdentityInput(room, sender, isGroupChat, channelId) {
        if (/^[1-9][0-9]*$/u.test(String(channelId ?? ""))) return `channel-id\n${channelId}`;
        return isGroupChat === false && room === sender ? "" : room;
      },
      signingKeyId() { return "current"; },
      messageDeliveryId(room, sender, message, logId, channelId, userHash) {
        return `delivery-${createHash("sha256").update([room, sender, message, logId, channelId, userHash].join("|")).digest("hex").slice(0, 32)}`;
      },
      deterministicMessageUuid(domain) {
        const suffix = Buffer.from(String(domain)).toString("hex").padEnd(32, "0").slice(0, 32);
        return `${suffix.slice(0, 8)}-${suffix.slice(8, 12)}-4${suffix.slice(13, 16)}-8${suffix.slice(17, 20)}-${suffix.slice(20)}`;
      },
      contextFromChat(room, sender, options = {}) {
        const requestContext = { room, sender, ...options };
        calls.contexts.push(structuredClone(requestContext));
        return requestContext;
      },
      newUuid() { return "abcdef01-2345-4789-abcd-ef0123456789"; },
      seasonApplications(command, requestContext) {
        calls.season.push({ command: structuredClone(command), requestContext: structuredClone(requestContext) });
        return {
          ok: true,
          status: 200,
          body: {
            applyDate: command.applyDate,
            recruitNo: command.recruitNo,
            appliedCount: command.participants?.length ?? 0,
            reserveCount: 0,
            confirmedCount: 0,
            pendingCount: 0,
            entries: (command.participants ?? []).map((entry) => ({
              ...entry,
              status: "APPLIED",
              source: "KAKAO",
              suppliedName: entry.name,
              suppliedRiotId: entry.riotId,
              player: null,
            })),
          },
        };
      },
      imageReceive(command, requestContext) {
        calls.images.push({ command: structuredClone(command), requestContext: structuredClone(requestContext) });
        return { ok: true, status: 200, body: { receivedImageCount: 2, expectedImageCount: 2, completed: true } };
      },
      sha256Base64BytesHex() { return "a".repeat(64); },
      searchPlayer() { return { ok: true, body: { items: [] } }; },
      playerRecord(query) {
        calls.records.push(query);
        return { ok: true, body: {
          kind: "PLAYER_RECORD", mode: "RECORD", query,
          player: { playerId: "player-1", displayName: "별빛", riotId: "별빛#KR1" },
          season: { id: "season-1", name: "가을 시즌" },
          summary: { totalGames: 12, participationCount: 7, wins: 5, losses: 2, winRate: 71.4, mvpCount: 2 },
          recentMatches: [{ matchId: "match-1", title: "저녁 내전", playedOn: "2026-09-08", gameNumber: 1, championName: "아리", team: "BLUE", position: "MID", won: true, mvp: true }],
        } };
      },
      recentMatches(query) {
        calls.recent.push(query);
        return { ok: true, body: {
          kind: "PLAYER_RECORD", mode: "RECENT", query,
          player: { playerId: "player-1", displayName: "별빛", riotId: "별빛#KR1" },
          season: { id: "season-1", name: "가을 시즌" }, summary: null,
          recentMatches: [{ matchId: "match-2", title: "주말 내전", playedOn: "2026-09-07", gameNumber: 2, championName: "럭스", team: "RED", position: "SUP", won: false, mvp: false }],
        } };
      },
      ranking() {
        calls.ranking += 1;
        return { ok: true, body: {
          kind: "RANKING", season: { id: "season-1", name: "가을 시즌" }, minimumParticipation: 1,
          rows: [{ rank: 1, playerId: "player-1", displayName: "별빛", riotId: "별빛#KR1", totalGames: 12, participationCount: 7, wins: 5, losses: 2, winRate: 71.4, mvpCount: 2 }],
          truncated: false,
        } };
      },
      scheduledNotice(slot) {
        calls.notices.push(slot);
        return { ok: true, body: {
          kind: "SCHEDULED_NOTICE", slot, seasonId: "season-1", date: "2026-09-08",
          targetCount: 10, total: 7, remaining: 3,
          positionCounts: { TOP: 2, JGL: 1, MID: 2, ADC: 1, SUP: 1 },
          shortagePositions: ["JGL", "ADC", "SUP"],
        } };
      },
      openchatStatus() { return { ok: true, body: { parties: [], scrims: [] } }; },
      recruit(command, requestContext) {
        calls.recruits.push({ command: structuredClone(command), requestContext: structuredClone(requestContext) });
        return { ok: true, body: {} };
      },
      operationForm() { return { ok: true, body: {} }; },
    },
    java: {
      text: {
        SimpleDateFormat: function SimpleDateFormat() {
          this.setTimeZone = () => {};
          this.format = () => "2026-09-08";
        },
      },
      util: {
        Date: function JavaDate() {},
        TimeZone: { getTimeZone() { return {}; } },
      },
      io: {
        ByteArrayOutputStream: function ByteArrayOutputStream() {
          this.toByteArray = () => [1, 2, 3];
          this.close = () => {};
        },
      },
    },
    android: {
      graphics: { Bitmap: { CompressFormat: { JPEG: "JPEG" } } },
      util: { Base64: { NO_WRAP: 2, encodeToString: () => "AQID" } },
    },
  });
  new vm.Script(`${compatibility}\n${source}`, { filename: routerPath }).runInContext(context);
  const replier = { reply(value) { replies.push(String(value)); } };
  const respond = (message, options = {}) => context.response(
    options.room ?? "테스트방",
    message,
    options.sender ?? "사용자",
    options.isGroupChat ?? true,
    replier,
    options.imageDB ?? null,
    "com.xfl.msgbot",
    false,
    options.logId ?? String(logSequence += 1),
    options.channelId,
    options.userHash,
  );
  return { context, values, replies, calls, respond };
}

const snapshot = [
  "[K-LOL.GG 내전 참가 신청]",
  "신청일：２０２６-０９-０８",
  "회차：＃３",
  "종목：협곡",
  "정원：１０명",
  "*참가 신청 양식*",
  "１． 플레이어： 별빛 | Riot ID： 별빛#KR1 | 주라인： MID | 부라인： SUP， ADC | 상태： 신청",
  "２．", "３．", "４．", "５．", "６．", "７．", "８．", "９．", "１０．",
].join("\n");

test("response stores a season preview and only the matching one-time code performs SYNC", async () => {
  const bot = await harness();
  bot.values.set("KLOL_V2_ACTIVE_SEASON_ID", "123e4567-e89b-42d3-a456-426614174000");

  bot.respond(snapshot);
  assert.equal(bot.calls.season.length, 0);
  assert.match(bot.replies.at(-1), /아직 사이트에 반영하지 않았습니다/u);
  assert.match(bot.replies.at(-1), /신청일: 2026-09-08 · 회차: #3/u);
  assert.match(bot.replies.at(-1), /인원: 1명 · 요약 해시: [A-F0-9]{8}/u);
  const code = bot.replies.at(-1).match(/\/내전확인 ([A-F0-9]{6})/u)?.[1];
  assert.equal(code, "ABCDEF");

  bot.respond("/내전확인 BAD999");
  assert.equal(bot.calls.season.length, 0);
  assert.match(bot.replies.at(-1), /확인 코드가 일치하지 않습니다/u);

  bot.respond(`/내전확인 ${code}`);
  assert.equal(bot.calls.season.length, 1);
  assert.deepEqual(bot.calls.season[0].command, {
    action: "SYNC",
    seasonId: "123e4567-e89b-42d3-a456-426614174000",
    applyDate: "2026-09-08",
    recruitNo: 3,
    mode: "RIFT",
    participants: [{ slotNo: 1, name: "별빛", riotId: "별빛#KR1", mainPosition: "MID", subPositions: ["SUP", "ADC"], reserve: false }],
  });

  bot.respond(`/내전확인 ${code}`);
  assert.equal(bot.calls.season.length, 1);
  assert.match(bot.replies.at(-1), /확인할 미리보기가 없거나/u);
});

test("response requires a complete authoritative snapshot scope and supports preview cancellation", async () => {
  const bot = await harness();
  bot.respond("[K-LOL.GG 내전 참가 신청]\n회차: #2\n종목: 협곡\n정원: 1명\n*참가 신청 양식*\n1. 플레이어: 별빛 | Riot ID: 별빛#KR1 | 주라인: MID | 부라인: SUP | 상태: 신청");
  assert.match(bot.replies.at(-1), /신청일: YYYY-MM-DD/u);
  assert.equal(bot.calls.season.length, 0);

  bot.respond("[K-LOL.GG 내전 참가 신청]\n신청일: 2026-09-08\n종목: 협곡\n정원: 1명\n*참가 신청 양식*\n1. 플레이어: 별빛 | Riot ID: 별빛#KR1 | 주라인: MID | 부라인: SUP | 상태: 신청");
  assert.match(bot.replies.at(-1), /회차: #번호/u);
  assert.equal(bot.calls.season.length, 0);

  bot.respond(snapshot);
  bot.respond("/내전미리보기취소");
  assert.match(bot.replies.at(-1), /사이트에는 반영하지 않았습니다/u);
  bot.respond("/내전확인 ABCDEF");
  assert.match(bot.replies.at(-1), /확인할 미리보기가 없거나/u);
  assert.equal(bot.calls.season.length, 0);

  bot.respond(snapshot);
  const previewEntry = [...bot.values.entries()].find(([key]) => key.startsWith("KLOL_V41_SEASON_PREVIEW_"));
  assert.ok(previewEntry);
  const expired = JSON.parse(previewEntry[1]);
  expired.createdAt = 0;
  bot.values.set(previewEntry[0], JSON.stringify(expired));
  bot.respond("/내전확인 ABCDEF");
  assert.match(bot.replies.at(-1), /확인할 미리보기가 없거나 10분이 지났습니다/u);
  assert.equal(bot.calls.season.length, 0);
});

test("response ignores server echoes and restores legacy guide aliases after full-width normalization", async () => {
  const bot = await harness();
  bot.respond("[K-LOL.GG V41 도움말]", { sender: "K-LOL 구인도우미" });
  assert.equal(bot.replies.length, 0);

  bot.respond("／등록");
  assert.match(bot.replies.at(-1), /\/start/u);
  bot.respond("／구인명령어");
  assert.match(bot.replies.at(-1), /생성: 5인파티/u);
  bot.respond("／결과현황");
  assert.match(bot.replies.at(-1), /\/matches\/submit/u);
  bot.respond("／경고현황");
  assert.match(bot.replies.at(-1), /\/account#discipline/u);
  bot.respond("／내전참가");
  assert.match(bot.replies.at(-1), /3\. 시즌내전 참가하기 클릭/u);
});

test("response preserves V40 room events, missing-number guidance, and parameterized managed shortcuts", async () => {
  const bot = await harness();
  bot.respond("새로운 사용자가 들어왔습니다");
  assert.match(bot.replies.at(-1), /반가워요/u);
  const welcomeCount = bot.replies.length;
  bot.respond("사용자가 나갔습니다");
  bot.respond("사용자가 초대되었습니다");
  assert.equal(bot.replies.length, welcomeCount);

  bot.respond(["📢 자랭 하실분!", "TOP. 탑솔러", "JUG. 정글러", "MID. 미드", "ADC. 원딜", "SUP. 서폿"].join("\n"));
  assert.match(bot.replies.at(-1), /모집번호를 찾지 못했습니다/u);

  bot.respond("/경고등록 대상자 사유");
  assert.match(bot.replies.at(-1), /\/admin\/discipline\/new/u);
  bot.respond("/경고인증완료 WRABCDEF0123");
  assert.match(bot.replies.at(-1), /\/account\/discipline/u);
  bot.respond("/내전현황 MRABCDEF0123");
  assert.match(bot.replies.at(-1), /\/matches\/submissions/u);
  bot.respond("[내전 결과 양식 v4]\n1. 결과: 블루 승");
  assert.match(bot.replies.at(-1), /\/matches\/submit/u);
});

test("response keeps an active image session when MessengerBot only exposes a placeholder", async () => {
  const bot = await harness();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  bot.respond(`/V2사진세션 ${sessionId}`);
  bot.respond("[사진]");
  assert.match(bot.replies.at(-1), /사진 원본을 읽지 못했습니다/u);
  assert.match(bot.replies.at(-1), /세션은 그대로 유지됩니다/u);
  bot.respond("/사진상태");
  assert.match(bot.replies.at(-1), /사진 세션이 연결되어 있습니다/u);
});

test("response routes legacy record, recent, and ranking commands through V2 data while preserving V1 replies", async () => {
  const bot = await harness();
  bot.respond("전적 별빛#KR1");
  assert.deepEqual(bot.calls.records, ["별빛#KR1"]);
  assert.match(bot.replies.at(-1), /\[별빛#KR1 전적\]/u);
  assert.match(bot.replies.at(-1), /전적: 5승 2패 \(71\.4%\)/u);
  assert.match(bot.replies.at(-1), /MVP: 2회/u);
  assert.match(bot.replies.at(-1), /최근: 승 아리/u);

  bot.respond("／최근\u00a0별빛#KR1");
  assert.deepEqual(bot.calls.recent, ["별빛#KR1"]);
  assert.match(bot.replies.at(-1), /\[별빛#KR1 최근 경기\]/u);
  assert.match(bot.replies.at(-1), /패 \| 럭스 \|/u);

  bot.respond("／랭킹");
  assert.equal(bot.calls.ranking, 1);
  assert.match(bot.replies.at(-1), /🏆 K-LOL\.GG 랭킹 TOP 5/u);
  assert.match(bot.replies.at(-1), /1\. 별빛#KR1 \| 승률 71\.4%/u);
});

test("response formats scheduled notice aliases as read-only previews", async () => {
  const bot = await harness();
  bot.respond("공지생성 18");
  assert.deepEqual(bot.calls.notices, ["18"]);
  assert.match(bot.replies.at(-1), /\[K-LOL\.GG 내전 공지 미리보기\]/u);
  assert.match(bot.replies.at(-1), /실제 방 자동 발송은 하지 않았습니다/u);
  assert.match(bot.replies.at(-1), /신청 7\/10 · 남은 인원 3명/u);
  assert.match(bot.replies.at(-1), /부족 포지션: 정글, 원딜, 서포터/u);

  bot.values.set("KLOL_V2_ACTIVE_SEASON_ID", "123e4567-e89b-42d3-a456-426614174000");
  bot.respond("／AI공지");
  assert.deepEqual(bot.calls.notices, ["18"]);
  assert.equal(bot.calls.season.length, 1);
});

test("response accepts bitmap fallback, reports image progress, and clears terminal or cancelled sessions", async () => {
  const bot = await harness();
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  bot.respond(`/V2사진세션 ${sessionId}`);
  bot.respond("/사진상태");
  assert.match(bot.replies.at(-1), /사진 세션이 연결되어 있습니다/u);

  let compressed = false;
  bot.respond("", {
    imageDB: {
      getImageBase64() { return ""; },
      getImage() { return ""; },
      getImageBitmap() { return { compress() { compressed = true; } }; },
    },
  });
  assert.equal(compressed, true);
  assert.equal(bot.calls.images.length, 1);
  assert.equal(bot.calls.images[0].command.base64Image, "AQID");
  assert.match(bot.replies.at(-1), /진행: 2\/2/u);
  assert.match(bot.replies.at(-1), /완료되었습니다/u);

  bot.respond("/사진상태");
  assert.match(bot.replies.at(-1), /연결된 사진 세션이 없습니다/u);
  bot.respond(`/V2사진세션 ${sessionId}`);
  bot.respond("/V2사진취소");
  bot.respond("/사진상태");
  assert.match(bot.replies.at(-1), /연결된 사진 세션이 없습니다/u);
});

test("response scopes different senders to one stable channel and rejects the broken legacy room fallback", async () => {
  const bot = await harness();
  bot.respond("/랭킹", { room: "관리자. 99", sender: "관리자. 99", isGroupChat: false, channelId: "987654321" });
  bot.respond("/랭킹", { room: "관리자. 97", sender: "관리자. 97", isGroupChat: false, channelId: "987654321" });
  assert.deepEqual(bot.calls.contexts.slice(-2).map((item) => item.room), ["channel-id\n987654321", "channel-id\n987654321"]);

  bot.respond("/V2연동확인", { room: "관리자. 99", sender: "관리자. 99", isGroupChat: false });
  assert.match(bot.replies.at(-1), /메신저봇R 0\.7\.34a 이상으로 업데이트/u);
});

test("response suppresses a duplicate callback with the same Kakao log identity", async () => {
  const bot = await harness();
  bot.respond("/랭킹", { channelId: "987654321", userHash: "same-user", logId: "777" });
  bot.respond("/랭킹", { channelId: "987654321", userHash: "same-user", logId: "777" });
  assert.equal(bot.calls.ranking, 1);
  assert.equal(bot.replies.length, 1);
});

test("response entry point keeps representative V1 and V2 replies identical with or without slash", async () => {
  for (const command of [
    "구인현황",
    "봇버전",
    "5인파티",
    "내전구인 협곡",
    "전적 별빛#KR1",
    "V2사진세션 123e4567-e89b-42d3-a456-426614174000",
    'V2양식 {"formType":"meetups","payload":{}}',
  ]) {
    const plain = await harness();
    const slash = await harness();
    plain.respond(command);
    slash.respond(`/${command}`);
    assert.deepEqual(slash.replies, plain.replies, command);
    assert.deepEqual(slash.calls, plain.calls, command);
  }
});

test("raw V2 recruiting JSON is explicitly marked for the server-side operator gate", async () => {
  const bot = await harness();
  bot.respond('V2모집 {"type":"GET_PARTY_STATUS","aggregateId":"123e4567-e89b-42d3-a456-426614174000","expectedRevision":0,"payload":{}}');
  assert.equal(bot.calls.recruits.length, 1);
  assert.equal(bot.calls.recruits[0].requestContext.commandSource, "RAW_V2");
});

test("response entry point does not treat slash-only, URL, middle slash, double slash, or slash-space as commands", async () => {
  const bot = await harness();
  for (const message of [
    "/",
    "https://k-lol.gg/help",
    "대화 중 /명령어를 적었습니다",
    "//명령어",
    "/ 명령어",
  ]) bot.respond(message);
  assert.deepEqual(bot.replies, []);
});
