import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const sourcePath = resolve(import.meta.dirname, "../integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V1_COMPAT.js");

async function loadCompat() {
  const source = await readFile(sourcePath, "utf8");
  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(source, context, { filename: sourcePath });
  return { compat: context.module.exports, source };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("V1 compatibility parser stays ES5, transport-free, and rejects unsafe input", async () => {
  const { compat, source } = await loadCompat();
  assert.doesNotMatch(source, /\b(?:const|let|class|import|export)\b/u);
  assert.doesNotMatch(source, /(?:Jsoup|fetch\s*\(|XMLHttpRequest|KLOL_V2_KAKAO)/u);
  assert.equal(compat.normalizeText("／전적　ＡＢＣ＃１２３\u00a0"), "/전적 ABC#123 ");
  assert.deepEqual(plain(compat.validateInput("안전\n입력")), { ok: true, error: null, text: "안전\n입력" });
  assert.equal(compat.validateInput("위험\u0001입력").error, "CONTROL_CHARACTER");
  assert.equal(compat.validateInput("가".repeat(12001)).error, "INPUT_TOO_LONG");
  assert.equal(compat.validateInput(Array.from({ length: 321 }, () => "").join("\n")).error, "TOO_MANY_LINES");
  assert.equal(compat.classifyMessage("위험\u0001입력", "보낸이", "2026-09-08").action, "REJECT");
});

test("all V40 party creation, finish, help, status, and detail aliases are classified", async () => {
  const { compat } = await loadCompat();
  const named = [
    ["자랭구인", "FLEX_RANK", 5], ["일반구인", "NORMAL_GAME", 5],
    ["솔랭구인", "SOLO_RANK", 2], ["칼바람구인", "ARAM", 5],
    ["증바람구인", "ARAM", 5], ["기타게임구인", "OTHER_GAME", 8],
    ["롤체일반구인", "TFT_NORMAL", 8], ["롤체랭크구인", "TFT_RANK", 3],
    ["더블업구인", "DOUBLE_UP", 2], ["5인협곡", "PARTY_RIFT", 5],
    ["5인 협곡 파티", "PARTY_RIFT", 5],
  ];
  for (const [command, type, maximumMembers] of named) {
    const parsed = compat.parsePartyCreateCommand(`/${command} 7`);
    assert.equal(parsed.type, type, command);
    assert.equal(parsed.maximumMembers, maximumMembers, command);
    assert.equal(parsed.explicitRecruitNumber, 7, command);
  }
  assert.deepEqual(
    plain(compat.parsePartyCreateCommand("１２인　구인　９")),
    { domain: "PARTY", action: "CREATE", type: "PARTY_NUMBER", title: "12인 파티 구인", maximumMembers: 12, explicitRecruitNumber: 9 },
  );
  for (const [command, recruitNo] of [["1쫑", 1], ["#1ㅉ", 1], ["1번 파티 마감", 1], ["구인마감 #1", 1], ["/구인종료 1", 1], ["13ㅉ", 13], ["/15ㅉ", 15]]) {
    assert.equal(compat.parsePartyFinishCommand(command).recruitNo, recruitNo, command);
  }
  for (const command of ["구인구직도움말", "/구인도움말", "구인명령어", "구인도우미", "구인웹도우미", "구인매뉴얼", "명령어페이지"]) {
    assert.equal(compat.classifyPartyCommand(command).action, "HELP", command);
  }
  for (const command of ["현재구인구직현황", "현재구인현황", "구인구직현황", "/구인현황", "현황"]) {
    assert.equal(compat.classifyPartyCommand(command).action, "STATUS", command);
  }
  assert.deepEqual(plain(compat.classifyPartyCommand("상세 #8")), { domain: "PARTY", action: "DETAIL", recruitNo: 8 });
});

test("party form parser preserves metadata, positions, numbered members, and substitutes", async () => {
  const { compat } = await loadCompat();
  const lineForm = [
    "📢 자랭 하실분!", "모집번호: #3", "》게임 시작 시간: 21:00 + 티어: E",
    "》게임정보: 즐겜", "듀오 선호 라인: MID", "TOP. 탑솔러", "JUG. 정글러",
    "MID. 미드", "ADC. 원딜", "SUP. 서폿", "예비 1. 후보A, 후보B",
  ].join("\n");
  const parsed = compat.parsePartyForm(lineForm);
  assert.equal(parsed.recruitNo, 3);
  assert.equal(parsed.type, "FLEX_RANK");
  assert.equal(parsed.startTimeText, "21:00");
  assert.equal(parsed.gameInfo, "즐겜");
  assert.equal(parsed.tierText, "E");
  assert.equal(parsed.preferredLineText, "MID");
  assert.equal(parsed.playStyle, "즐겜");
  assert.deepEqual(
    plain(parsed.members.map(({ name, position, slotNo, substitute }) => ({ name, position, slotNo, substitute }))),
    [
      { name: "탑솔러", position: "TOP", slotNo: null, substitute: false },
      { name: "정글러", position: "JGL", slotNo: null, substitute: false },
      { name: "미드", position: "MID", slotNo: null, substitute: false },
      { name: "원딜", position: "ADC", slotNo: null, substitute: false },
      { name: "서폿", position: "SUP", slotNo: null, substitute: false },
      { name: "후보A", position: null, slotNo: 1, substitute: true },
      { name: "후보B", position: null, slotNo: 2, substitute: true },
    ],
  );

  const numbered = ["📢 4인 파티 구인", "모집번호: #4", "시작시간: 22:00", "1. 하나", "2. 둘", "4. 넷", "예비 1. 대기"].join("\n");
  assert.deepEqual(
    plain(compat.parsePartyForm(numbered).members.map(({ name, slotNo, substitute }) => ({ name, slotNo, substitute }))),
    [
      { name: "하나", slotNo: 1, substitute: false }, { name: "둘", slotNo: 2, substitute: false },
      { name: "넷", slotNo: 4, substitute: false }, { name: "대기", slotNo: 1, substitute: true },
    ],
  );
  assert.equal(compat.parsePartyForm(`${numbered}\n2. 중복`), null, "duplicate regular slots must be rejected");
  assert.equal(compat.parsePartyForm(`${lineForm}\nTOP. 중복`), null, "duplicate position slots must be rejected");
  for (const label of ["후보", "대기"]) {
    const candidate = compat.parsePartyForm(["📢 1인 파티 구인", "모집번호: #5", "1. 참가자", `${label} 1. 후보자`].join("\n"));
    assert.equal(candidate.members.at(-1).substitute, true, label);
    assert.equal(candidate.members.at(-1).name, "후보자", label);
  }
  const missingNumber = ["📢 자랭 하실분!", "TOP. 탑솔러", "JUG. 정글러", "MID. 미드", "ADC. 원딜", "SUP. 서폿"].join("\n");
  assert.equal(compat.isPartyFormWithoutNumber(missingNumber), true);
  assert.deepEqual(plain(compat.classifyMessage(missingNumber, "보낸이", "2026-09-08")), { domain: "PARTY", action: "MISSING_NUMBER" });
  assert.equal(compat.isPartyFormWithoutNumber("[K-LOL.GG 내전 참가 신청]\n신청일: 2026-09-08\n회차: #1\n1. 플레이어: 별빛 | Riot ID: 별빛#KR1 | 주라인: MID"), false);
  assert.deepEqual(plain(compat.parsePartyForm(["📢 2인 파티 구인", "모집번호: #9", "1.", "2.", "예비 1."].join("\n")).members), []);
});

test("party form metadata accepts line endings and colon variants without rewriting values", async () => {
  const { compat } = await loadCompat();
  for (const separator of ["\n", "\r\n"]) {
    const populated = compat.parsePartyForm([
      "📢 5인 파티 구인", "모집번호: #7", "》시작시간 ：   모이면   ", "》게임정보:   일겜or자랭   ", "1. 참가자",
    ].join(separator));
    assert.equal(populated.startTimeText, "모이면");
    assert.equal(populated.gameInfo, "일겜or자랭");

    const empty = compat.parsePartyForm([
      "📢 5인 파티 구인", "모집번호: #8", "》시작시간:", "》게임정보：   ", "1. 참가자",
    ].join(separator));
    assert.equal(empty.startTimeText, null);
    assert.equal(empty.gameInfo, null);
  }
});

test("party form tolerates clipped headers, Markdown escapes, attached values, and controlled line wraps", async () => {
  const { compat } = await loadCompat();
  const parsed = compat.parsePartyForm([
    " /K-LOL.GG 구인구직 양식]", "📢 5인 파티 구인", "모 집 번 호 : \\#15",
    "》시작시간:", "모이면", "》게임정보:", "일겜 or 자랭",
    "1.붙임", "2 공백", "3\\.", "줄바꿈", "4.", "5.", "예비 1\\.", "대기자",
  ].join("\n"));
  assert.equal(parsed.recruitNo, 15);
  assert.equal(parsed.startTimeText, "모이면");
  assert.equal(parsed.gameInfo, "일겜 or 자랭");
  assert.deepEqual(
    plain(parsed.members.map(({ name, slotNo, substitute }) => ({ name, slotNo, substitute }))),
    [
      { name: "붙임", slotNo: 1, substitute: false },
      { name: "공백", slotNo: 2, substitute: false },
      { name: "줄바꿈", slotNo: 3, substitute: false },
      { name: "대기자", slotNo: 1, substitute: true },
    ],
  );
});

test("inhouse aliases parse mode, date, time, recruit number, and capacity", async () => {
  const { compat } = await loadCompat();
  const create = compat.parseInhouseCommand("/내전구인 협곡 2026.9.10 21:30 #2 12명", "2026-09-08");
  assert.deepEqual(plain(create), {
    domain: "INHOUSE", action: "CREATE", mode: "RIFT", dateKey: "2026-09-10", time: "21:30",
    recruitNo: 2, capacity: 12, templateRequest: false, invalidMode: null,
  });
  assert.equal(compat.parseInhouseCommand("내전구인 칼바람").mode, "ARAM");
  assert.equal(compat.parseInhouseCommand("내전모집 증강칼바람").mode, "AUGMENT_ARAM");
  assert.equal(compat.parseInhouseCommand("내전구인", "2026-09-08").templateRequest, true);
  assert.equal(compat.parseInhouseCommand("내전상세 #3").action, "DETAIL");
  assert.deepEqual(plain(compat.parseInhouseCommand("내전상세")), { domain: "INHOUSE", action: "DETAIL", recruitNo: null });
  for (const command of ["내전현황", "시즌내전현황 #2", "AI공지"]) assert.equal(compat.parseInhouseCommand(command).action, "STATUS");
  for (const command of ["내전참가", "내전신청 #2", "참가신청 3"]) assert.equal(compat.parseInhouseCommand(command).action, "JOIN");
});

test("scrim aliases and legacy full form are converted without a transport call", async () => {
  const { compat } = await loadCompat();
  assert.equal(compat.parseScrimCommand("/스크림구인").templateRequest, true);
  assert.equal(compat.parseScrimCommand("멸망전 스크림 모집").action, "CREATE");
  assert.deepEqual(plain(compat.parseScrimCommand("스크림상세 #2")), { domain: "SCRIM", action: "DETAIL", scrimNo: 2 });
  for (const command of ["스크림현황", "스크림목록", "멸망전스크림현황", "멸망전 스크림 목록 #4"]) {
    assert.equal(compat.parseScrimCommand(command).action, "STATUS", command);
  }
  const form = [
    "[K-LOL.GG 스크림 구인 양식]", "운영일: 2026-09-09", "번호: #2", "멸망전번호: 7",
    "일시: 9/10 21:00", "방식: 3판2선", "우리팀: 하늘", "TOP: 탑1", "JUG: 정글1",
    "MID: 미드1", "ADC: 원딜1", "SUP: 서폿1", "상대팀: 꽃잎", "TOP: 탑2",
    "JUG: 정글2", "MID: 미드2", "ADC: 원딜2", "SUP: 서폿2",
  ].join("\n");
  const parsed = compat.parseScrimCommand(form);
  assert.equal(parsed.operationDate, "2026-09-09");
  assert.equal(parsed.scrimNo, 2);
  assert.equal(parsed.tournamentNo, 7);
  assert.equal(parsed.requesterTeamName, "하늘");
  assert.equal(parsed.opponentTeamName, "꽃잎");
  assert.deepEqual(plain(parsed.requesterLineup), { top: "탑1", jungle: "정글1", mid: "미드1", adc: "원딜1", support: "서폿1" });
  assert.deepEqual(plain(parsed.opponentLineup), { top: "탑2", jungle: "정글2", mid: "미드2", adc: "원딜2", support: "서폿2" });
  assert.equal(parsed.gameCount, 3);
  assert.equal(parsed.seriesRuleText, "3판2선");
});

test("four operation forms become exact V2 payload shapes with sender fallbacks", async () => {
  const { compat } = await loadCompat();
  const friends = compat.parseOperationForm([
    "1. 지인 이름: 친구", "2. 지인 닉네임: Friend#KR1", "3. 이용기간: 장기", "4. 디스코드 닉네임 변경: 네",
  ].join("\n"), "보낸이");
  assert.deepEqual(plain(friends), {
    domain: "OPERATION_FORM", action: "SUBMIT", formType: "friends",
    payload: { applicantName: "보낸이", applicantNickname: "보낸이", friendName: "친구", friendNickname: "Friend#KR1", usagePeriod: "장기", discordNicknameChange: true },
  });
  const suggestions = compat.parseOperationForm("본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 개선 바랍니다.", "보낸이");
  assert.deepEqual(plain(suggestions.payload), { applicantName: "홍길동", applicantNickname: "테스터", reason: "편의성", content: "개선 바랍니다." });

  const meetups = compat.parseOperationForm("주최자 이름 및 닉네임:\n일자: 2026-09-10 18시\n장소: 서울\n참여자 명단:\n1. 가\n2. 나\n3. 가", "주최자");
  assert.deepEqual(plain(meetups.payload), { hostName: "주최자", hostNickname: "주최자", meetupAt: null, legacyDateText: "2026-09-10 18시", location: "서울", participants: ["가", "나"] });

  const leaves = compat.parseOperationForm("이름 및 닉네임: 신청자/닉\n외출기간: 2026-09-10 ~ 2026-09-12\n외출사유: 여행\n외출범위: (소통방, 구인방, 디코)", "보낸이");
  assert.deepEqual(plain(leaves.payload), { applicantName: "신청자", applicantNickname: "닉", periodStart: "2026-09-10", periodEnd: "2026-09-12", reason: "여행", scope: "소통방, 구인방, 디코" });
});

test("four legacy 외출 wrappers parse identically and missing fields are explicit", async () => {
  const { compat } = await loadCompat();
  const fields = [
    "1. 이름 및 닉네임: 신청자/닉",
    "2. 외출기간: 2026-09-10 ~ 2026-09-12",
    "3. 외출사유: 여행",
    "4. 외출범위 (소통방,구인방,디코) 소통방",
  ].join("\n");
  const forms = [
    ["💟간편 공지💟", "1. 안내를 확인해 주세요.", "2. 양식작성 후 전송해 주세요.", "3. &lt;외출&gt;", "4. 필수값을 작성해 주세요.", "5. 운영진이 확인합니다.", "6. 완료 안내를 기다려 주세요.", fields].join("\n"),
    ["2. 양식작성 후 전송", "&lt;외출&gt;", fields].join("\n"),
    ["<외출>", fields].join("\n"),
    ["&lt;외출&gt;", fields.replace("외출범위 (소통방,구인방,디코) 소통방", "외출범위 : 소통방")].join("\n"),
  ];
  for (const form of forms) {
    assert.deepEqual(plain(compat.parseOperationForm(form, "보낸이")), {
      domain: "OPERATION_FORM", action: "SUBMIT", formType: "leaves",
      payload: { applicantName: "신청자", applicantNickname: "닉", periodStart: "2026-09-10", periodEnd: "2026-09-12", reason: "여행", scope: "소통방" },
    });
  }
  assert.deepEqual(plain(compat.parseOperationForm("&lt;외출&gt;\n1. 이름 및 닉네임: 신청자/닉\n2. 외출기간:\n3. 외출사유:\n4. 외출범위:", "보낸이")), {
    domain: "OPERATION_FORM", action: "INVALID", formType: "leaves", missingFields: ["외출기간", "외출사유", "외출범위"],
  });
});

test("registration, warning, result, evidence, status, and photo-cancel aliases are classified", async () => {
  const { compat } = await loadCompat();
  const aliases = [
    ["등록", "REGISTRATION_HUB"], ["등록도움말", "REGISTRATION_HUB"],
    ["내전등록", "INHOUSE_RESULT"], ["결과등록", "INHOUSE_RESULT"], ["내전결과", "INHOUSE_RESULT"],
    ["내전등록현황", "INHOUSE_RESULT_STATUS"], ["결과현황", "INHOUSE_RESULT_STATUS"],
    ["경고", "DISCIPLINE_CREATE"], ["경고등록", "DISCIPLINE_CREATE"],
    ["인증", "DISCIPLINE_EVIDENCE"], ["경고인증", "DISCIPLINE_EVIDENCE"],
    ["경고현황", "DISCIPLINE_STATUS"], ["사진취소", "PHOTO_CANCEL"], ["V2사진취소", "PHOTO_CANCEL"],
  ];
  for (const [command, action] of aliases) assert.equal(compat.classifyManagedCommand(`/${command}`).action, action, command);
  for (const [command, action] of [
    ["/경고등록 대상자 사유", "DISCIPLINE_CREATE"],
    ["경고현황 WRABCDEF0123", "DISCIPLINE_STATUS"],
    ["/경고인증완료 WRABCDEF0123", "DISCIPLINE_EVIDENCE"],
    ["내전등록 MRABCDEF0123", "INHOUSE_RESULT"],
    ["/내전현황 MRABCDEF0123", "INHOUSE_RESULT_STATUS"],
    ["[내전 결과 양식 v4]\n1. 결과: 블루 승", "INHOUSE_RESULT"],
    ["[징계 등록 양식 v2]\n1. 대상: 별빛", "DISCIPLINE_CREATE"],
  ]) assert.equal(compat.classifyManagedCommand(command).action, action, command);
});
