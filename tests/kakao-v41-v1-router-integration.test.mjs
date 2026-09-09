import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");

async function harness() {
  const [compatibility, router] = await Promise.all([
    readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V1_COMPAT.js"), "utf8"),
    readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js"), "utf8"),
  ]);
  const values = new Map();
  const replies = [];
  const calls = { recruits: [], forms: [] };
  const parties = [];
  const scrims = [];
  const receipts = new Map();
  const context = vm.createContext({
    console,
    DataBase: {
      getDataBase(key) { return values.get(String(key)) ?? ""; },
      setDataBase(key, value) { values.set(String(key), String(value)); },
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
    },
    KLOL_V2_KAKAO: {
      identityForChat(room, sender) {
        const safe = (value) => String(value).replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "empty";
        return { roomId: `room-${safe(room)}`, senderId: `sender-${safe(sender)}` };
      },
      contextFromChat(room, sender, options = {}) { return { room, sender, ...options }; },
      newUuid() { return "123e4567-e89b-42d3-a456-426614174000"; },
      userMessage(result) { return result?.ok ? "[K-LOL.GG]\n요청을 안전하게 처리했습니다." : "[K-LOL.GG 요청 실패]\n테스트 실패"; },
      openchatStatus() {
        return {
          ok: true,
          body: {
            nextPartyRecruitNumber: parties.length ? Math.max(...parties.map((party) => party.recruitNumber)) + 1 : 1,
            nextPartyResetSequence: 0,
            nextScrimNumber: scrims.length ? Math.max(...scrims.map((scrim) => scrim.scrimNumber)) + 1 : 1,
            parties: structuredClone(parties.filter((party) => party.status === "IN_PROGRESS")),
            scrims: structuredClone(scrims.filter((scrim) => ["RECRUITING", "MATCHED", "CONFIRMED"].includes(scrim.status))),
          },
        };
      },
      recruit(command, requestContext) {
        calls.recruits.push({ command: structuredClone(command), requestContext: structuredClone(requestContext) });
        if (receipts.has(requestContext.requestKey)) return structuredClone(receipts.get(requestContext.requestKey));
        let effectiveCommand = structuredClone(command);
        if (command.compatTarget?.kind === "PARTY") {
          const target = parties.find((entry) => entry.recruitDate === command.compatTarget.recruitDate && entry.recruitNumber === command.compatTarget.recruitNumber);
          if (target) effectiveCommand.aggregateId = target.id;
          else if (command.compatCreate && command.type === "SYNC_PARTY") {
            effectiveCommand = {
              type: "CREATE_PARTY",
              aggregateId: command.aggregateId,
              payload: {
                recruitDate: command.compatTarget.recruitDate,
                resetSequence: null,
                recruitNumber: command.compatTarget.recruitNumber,
                partyType: command.compatCreate.partyType,
                title: command.compatCreate.title,
                maximumMembers: command.compatCreate.maximumMembers,
                members: structuredClone(command.payload.members),
                startTimeText: command.payload.startTimeText,
                gameInfo: command.payload.gameInfo,
                scheduledStartAt: command.payload.scheduledStartAt,
                protectedUntil: null,
              },
            };
          } else return { ok: false, status: 404, body: { code: "NOT_FOUND" } };
        }
        command = effectiveCommand;
        if (command.type === "CREATE_SCRIM") {
          const scrim = {
            id: command.aggregateId,
            revision: 0,
            ...structuredClone(command.payload),
            status: "RECRUITING",
          };
          scrims.push(scrim);
          const result = {
            ok: true,
            body: {
              aggregateKind: "SCRIM", aggregateId: scrim.id, revision: 0, status: scrim.status,
              commandType: command.type, data: structuredClone(scrim),
            },
          };
          receipts.set(requestContext.requestKey, structuredClone(result));
          return result;
        }
        let party = parties.find((entry) => entry.id === command.aggregateId);
        if (command.type === "CREATE_PARTY") {
          const nextNumber = command.payload.recruitNumber ?? (parties.length ? Math.max(...parties.map((entry) => entry.recruitNumber)) + 1 : 1);
          party = {
            id: command.aggregateId,
            revision: 0,
            recruitDate: command.payload.recruitDate,
            resetSequence: command.payload.resetSequence ?? 0,
            recruitNumber: nextNumber,
            type: command.payload.partyType,
            title: command.payload.title,
            status: "IN_PROGRESS",
            memberCount: command.payload.members.filter((member) => !member.substitute).length,
            reserveCount: command.payload.members.filter((member) => member.substitute).length,
            maximumMembers: command.payload.maximumMembers,
            members: structuredClone(command.payload.members),
            scheduledStartAt: command.payload.scheduledStartAt,
            startTimeText: command.payload.startTimeText || "00:00",
            gameInfo: command.payload.gameInfo || "미입력",
          };
          parties.push(party);
        } else if (command.type === "SYNC_PARTY") {
          party.revision += 1;
          party.members = structuredClone(command.payload.members);
          party.memberCount = party.members.filter((member) => !member.substitute).length;
          party.reserveCount = party.members.filter((member) => member.substitute).length;
          if (command.payload.startTimeText) party.startTimeText = command.payload.startTimeText;
          if (command.payload.gameInfo) party.gameInfo = command.payload.gameInfo;
          if (Object.prototype.hasOwnProperty.call(command.payload, "scheduledStartAt")) party.scheduledStartAt = command.payload.scheduledStartAt;
        } else if (command.type === "FINISH_PARTY") {
          party.revision += 1;
          party.status = "FINISHED";
        }
        const result = {
          ok: true,
          body: {
            aggregateKind: "PARTY",
            aggregateId: party.id,
            revision: party.revision,
            status: party.status,
            commandType: command.type,
            data: {
              id: party.id,
              recruitNumber: party.recruitNumber,
              type: party.type,
              status: party.status,
              title: party.title,
              memberCount: party.memberCount,
              maximumMembers: party.maximumMembers,
              scheduledStartAt: party.scheduledStartAt,
              startTimeText: party.startTimeText,
              gameInfo: party.gameInfo,
            },
          },
        };
        receipts.set(requestContext.requestKey, structuredClone(result));
        return result;
      },
      operationForm(formType, payload, requestContext) {
        calls.forms.push({ formType, payload: structuredClone(payload), requestContext: structuredClone(requestContext) });
        return { ok: true, body: { id: "form-1", status: "PENDING" } };
      },
      seasonApplications() { return { ok: true, body: { entries: [] } }; },
      imageReceive() { return { ok: true, body: {} }; },
      playerRecord() { return { ok: true, body: {} }; },
      recentMatches() { return { ok: true, body: {} }; },
      ranking() { return { ok: true, body: { rows: [] } }; },
      scheduledNotice() { return { ok: true, body: {} }; },
      sha256Base64BytesHex() { return "a".repeat(64); },
    },
  });
  new vm.Script(`${compatibility}\n${router}`, { filename: "KLOL_V41_COMPLETE_TEST.js" }).runInContext(context);
  const replier = { reply(value) { replies.push(String(value)); } };
  const respond = (message, options = {}) => context.response(
    options.room ?? "테스트방", message, options.sender ?? "사용자", true, replier, null, "com.xfl.msgbot",
  );
  return { calls, parties, scrims, replies, respond };
}

test("legacy party create suppresses a duplicate callback before a second V2 mutation", async () => {
  const bot = await harness();
  bot.respond("자랭구인 7");
  bot.respond("자랭구인 7");

  assert.equal(bot.calls.recruits.length, 1);
  assert.deepEqual(bot.calls.recruits[0].command, {
    type: "CREATE_PARTY",
    aggregateId: "123e4567-e89b-42d3-a456-426614174000",
    payload: {
      recruitDate: "2026-09-08",
      resetSequence: null,
      recruitNumber: 7,
      partyType: "FLEX_RANK",
      title: "자랭 하실분!",
      maximumMembers: 5,
      members: [],
      startTimeText: null,
      gameInfo: null,
      scheduledStartAt: null,
      protectedUntil: null,
    },
  });
  assert.equal(bot.calls.recruits[0].requestContext.expectedRevision, 0);
  assert.equal(bot.parties.length, 1);
  assert.match(bot.replies.at(-1), /모집번호: #7/u);
  assert.match(bot.replies.at(-1), /TOP\./u);
  assert.doesNotMatch(bot.replies.at(-1), /》시작시간/u);
  assert.doesNotMatch(bot.replies.at(-1), /》게임정보/u);
});

test("legacy full party form maps positions to slots and synchronizes the existing V2 party", async () => {
  const bot = await harness();
  bot.respond("자랭구인 7");
  bot.respond([
    "📢 자랭 하실분!", "모집번호: #7", "게임 시작 시간: 21:00",
    "TOP. 탑솔러", "JUG. 정글러", "MID. 미드", "ADC. 원딜", "SUP. 서폿",
  ].join("\n"));

  const call = bot.calls.recruits.at(-1);
  assert.equal(call.command.type, "SYNC_PARTY");
  assert.equal(call.command.payload.startTimeText, "21:00");
  assert.equal(call.command.payload.gameInfo, null);
  assert.equal(call.requestContext.expectedRevision, 0);
  assert.deepEqual(call.command.payload.members.map(({ name, position, slotNo, substitute }) => ({ name, position, slotNo, substitute })), [
    { name: "탑솔러", position: "TOP", slotNo: 1, substitute: false },
    { name: "정글러", position: "JGL", slotNo: 2, substitute: false },
    { name: "미드", position: "MID", slotNo: 3, substitute: false },
    { name: "원딜", position: "ADC", slotNo: 4, substitute: false },
    { name: "서폿", position: "SUP", slotNo: 5, substitute: false },
  ]);
  assert.match(bot.replies.at(-1), /\[파티 #7 반영\]/u);
  assert.match(bot.replies.at(-1), /5\/5 · 예비 0명/u);
  assert.match(bot.replies.at(-1), /시작시간: 21:00/u);
  assert.match(bot.replies.at(-1), /게임정보: 미입력/u);
});

test("slash and plain temporary/form flows share server-first metadata fallback and preserve free text", async () => {
  for (const createText of ["5인파티 9", "/5인파티 9"]) {
    const bot = await harness();
    bot.respond(createText);
    assert.equal(bot.calls.recruits[0].command.payload.startTimeText, null);
    assert.equal(bot.calls.recruits[0].command.payload.gameInfo, null);
    assert.doesNotMatch(bot.replies.at(-1), /》시작시간/u);
    assert.doesNotMatch(bot.replies.at(-1), /》게임정보/u);

    for (const separator of ["\n", "\r\n"]) {
      bot.respond([
        "📢 5인 파티 구인", "모집번호: #9", "》시작시간 ：   모이면   ",
        "》게임정보:   일겜or자랭   ", "1. 참가자",
      ].join(separator));
      const call = bot.calls.recruits.at(-1);
      assert.equal(call.command.type, "SYNC_PARTY");
      assert.equal(call.command.payload.startTimeText, "모이면");
      assert.equal(call.command.payload.gameInfo, "일겜or자랭");
      assert.match(bot.replies.at(-1), /시작시간: 모이면/u);
      assert.match(bot.replies.at(-1), /게임정보: 일겜or자랭/u);
    }
  }
});

test("99 재현, 지오, 97 기용 fixtures complete public create, form, and finish flows with or without slash", async () => {
  for (const sender of ["99 재현", "지오", "97 기용"]) {
    for (const slash of ["", "/"]) {
      const bot = await harness();
      bot.respond(`${slash}2인파티 7`, { sender });
      bot.respond([
        "📢 2인 파티 구인", "모집번호: #7", "》시작시간: 모이면", "》게임정보: 일겜or자랭", "1. 참가자",
      ].join("\n"), { sender });
      bot.respond(`${slash}7ㅉ`, { sender });
      assert.deepEqual(bot.calls.recruits.map(({ command }) => command.type), ["CREATE_PARTY", "SYNC_PARTY", "FINISH_PARTY"], `${sender}:${slash || "plain"}`);
      assert.equal(bot.parties[0].status, "FINISHED");
      assert.doesNotMatch(bot.replies.join("\n"), /요청 실패/u);
    }
  }
});

test("legacy party candidates stay separate from primary capacity", async () => {
  const bot = await harness();
  bot.respond([
    "📢 자랭 하실분!", "모집번호: #7", "게임 시작 시간: 21:00",
    "TOP. 탑솔러", "JUG. 정글러", "MID. 미드", "ADC. 원딜", "SUP. 서폿",
    "후보 1. 후보A, 후보B",
  ].join("\n"));

  const call = bot.calls.recruits.at(-1);
  assert.equal(call.command.type, "SYNC_PARTY");
  assert.equal(call.command.compatCreate.maximumMembers, 5);
  assert.equal(call.command.payload.members.filter((member) => !member.substitute).length, 5);
  assert.deepEqual(call.command.payload.members.filter((member) => member.substitute).map((member) => member.name), ["후보A", "후보B"]);
  assert.match(bot.replies.at(-1), /5\/5 · 예비 2명/u);
});

test("legacy finish suppresses a duplicate callback after the party leaves active status", async () => {
  const bot = await harness();
  bot.respond("자랭구인 7");
  bot.respond("7ㅉ");
  bot.respond("7ㅉ");

  assert.deepEqual(bot.calls.recruits.map(({ command }) => command.type), ["CREATE_PARTY", "FINISH_PARTY"]);
  assert.equal(bot.parties[0].status, "FINISHED");
  assert.match(bot.replies.at(-1), /모집을 마감했습니다/u);
});

test("legacy operation form, inhouse template, and scrim template stay available", async () => {
  const bot = await harness();
  bot.respond("본인 이름 및 닉네임: 홍길동/별빛\n건의 사유: 편의성\n건의 내용: 모바일 개선");
  assert.equal(bot.calls.forms.length, 1);
  assert.equal(bot.calls.forms[0].formType, "suggestions");
  assert.deepEqual(bot.calls.forms[0].payload, {
    applicantName: "홍길동", applicantNickname: "별빛", reason: "편의성", content: "모바일 개선",
  });
  assert.match(bot.replies.at(-1), /양식을 접수했습니다/u);

  bot.respond("내전구인 칼바람 2026-09-10 21:30 #2 12명");
  assert.match(bot.replies.at(-1), /📢 내전하실분 #2/u);
  assert.match(bot.replies.at(-1), /》칼바람/u);
  assert.match(bot.replies.at(-1), /2026-09-10 21:30 시작/u);
  assert.match(bot.replies.at(-1), /12\./u);

  bot.respond("스크림구인");
  assert.match(bot.replies.at(-1), /스크림 구인 양식/u);
  assert.match(bot.replies.at(-1), /번호: #자동배정/u);
});

test("legacy scrim full form is stored through the typed V2 mutation and replays safely", async () => {
  const bot = await harness();
  const form = [
    "[K-LOL.GG 스크림 구인 양식]", "운영일: 2026-09-08", "번호: #2", "멸망전번호: 14",
    "일시: 21:30", "방식: 3판2선", "우리팀: 별빛단",
    "TOP: 우리탑", "JUG: 우리정글", "MID: 우리미드", "ADC: 우리원딜", "SUP: 우리서폿",
    "상대팀: 달빛단", "TOP: 상대탑", "JUG: 상대정글", "MID: 상대미드", "ADC: 상대원딜", "SUP: 상대서폿",
    "메모: 즐겁게 진행해요",
  ].join("\n");

  bot.respond(form);
  bot.respond(form);

  const call = bot.calls.recruits[0];
  assert.equal(call.command.type, "CREATE_SCRIM");
  assert.equal(call.command.payload.tournamentId, null);
  assert.equal(call.command.payload.legacyTournamentNumber, 14);
  assert.equal(call.command.payload.requesterTeamId, null);
  assert.equal(call.command.payload.requesterTeamName, "별빛단");
  assert.deepEqual(call.command.payload.requesterLineup, {
    top: "우리탑", jungle: "우리정글", mid: "우리미드", adc: "우리원딜", support: "우리서폿",
  });
  assert.deepEqual(call.command.payload.opponentLineup, {
    top: "상대탑", jungle: "상대정글", mid: "상대미드", adc: "상대원딜", support: "상대서폿",
  });
  assert.equal(call.command.payload.scheduledAt, "2026-09-08T12:30:00.000Z");
  assert.equal(bot.calls.recruits.length, 1);
  assert.equal(bot.scrims.length, 1);
  assert.deepEqual(bot.replies.slice(-1), ["[K-LOL.GG 스크림 등록 완료]"]);
});
