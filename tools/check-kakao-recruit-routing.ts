import {
  buildScrimRecruitTemplate,
  getScrimRecruitDateKey,
  parseScrimAction,
  parseScrimCreateCommand,
  parseScrimNumberCommand,
} from "../src/lib/kakao/destruction-scrim-recruit";
import {
  parseFinishRecruitCommand,
  parsePartyForm,
  promotePartySubstitutesAfterRemoval,
} from "../src/lib/kakao/party-recruit";
import { classifyKakaoRecruitMessage } from "../src/lib/kakao/recruit-message-kind";
import { getKstOperationDateKey } from "../src/lib/date/kst";
import { parseRecruitMessage } from "../src/lib/kakao/recruit-message-parser";
import { cleanStoredSubstituteName } from "../src/lib/kakao/recruit-health-utils";
import {
  getKakaoMessageValidationError,
  MAX_KAKAO_MESSAGE_LENGTH,
  normalizeKakaoIdentity,
} from "../src/lib/kakao/input-guard";
import { normalizeKakaoRequestId } from "../src/lib/kakao/request-id";

type ExpectedKind = "PARTY_RECRUIT" | "SCRIM_RECRUIT" | "SEASON_RECRUIT" | "UNKNOWN";

type Case = {
  name: string;
  raw: string;
  kind: ExpectedKind;
  partyNo?: number;
  scrimNo?: number;
};

function decode(raw: string) {
  return JSON.parse(`"${raw}"`) as string;
}

const cases: Case[] = [
  { name: "party close short 1", raw: "\\u0031\\u3149", kind: "PARTY_RECRUIT", partyNo: 1 },
  { name: "party close jjong hash", raw: "#12\\uCAD1", kind: "PARTY_RECRUIT", partyNo: 12 },
  { name: "party close n-person", raw: "13\\uC778\\uD30C\\uD2F0 \\u3149", kind: "PARTY_RECRUIT", partyNo: 13 },
  { name: "party close command", raw: "\\uAD6C\\uC778\\uB9C8\\uAC10 #9", kind: "PARTY_RECRUIT", partyNo: 9 },
  { name: "party status", raw: "\\uAD6C\\uC778\\uD604\\uD669", kind: "PARTY_RECRUIT" },
  { name: "party create n-person", raw: "5\\uC778\\uD30C\\uD2F0", kind: "PARTY_RECRUIT" },
  { name: "scrim close compact disabled", raw: "\\uC2A4\\uD06C\\uB9BC1\\u3149", kind: "UNKNOWN", scrimNo: 1 },
  { name: "scrim close spaced disabled", raw: "\\uC2A4\\uD06C\\uB9BC \\uCAD1 2", kind: "UNKNOWN", scrimNo: 2 },
  { name: "scrim close command disabled", raw: "/\\uC2A4\\uD06C\\uB9BC\\uC885\\uB8CC 3", kind: "UNKNOWN", scrimNo: 3 },
  { name: "scrim join disabled", raw: "\\uC2A4\\uD06C\\uB9BC\\uCC38\\uAC00 1", kind: "UNKNOWN", scrimNo: 1 },
  { name: "scrim confirm disabled", raw: "\\uC2A4\\uD06C\\uB9BC\\uD655\\uC815 1", kind: "UNKNOWN", scrimNo: 1 },
  { name: "scrim cancel disabled", raw: "\\uC2A4\\uD06C\\uB9BC\\uCDE8\\uC18C 1", kind: "UNKNOWN", scrimNo: 1 },
  { name: "destruction scrim cancel disabled", raw: "\\uBA78\\uB9DD\\uC804\\uC2A4\\uD06C\\uB9BC\\uCDE8\\uC18C 1", kind: "UNKNOWN", scrimNo: 1 },
  { name: "scrim status", raw: "\\uC2A4\\uD06C\\uB9BC\\uD604\\uD669", kind: "SCRIM_RECRUIT" },
  { name: "season status", raw: "\\uB0B4\\uC804\\uD604\\uD669", kind: "SEASON_RECRUIT" },
  { name: "season reset disabled", raw: "\\uC624\\uB298\\uB0B4\\uC804\\uCD08\\uAE30\\uD654", kind: "UNKNOWN" },
  { name: "unknown free chat", raw: "\\uC548\\uB155\\uD558\\uC138\\uC694", kind: "UNKNOWN" },
];

const failures: string[] = [];

for (const item of cases) {
  const message = decode(item.raw);
  const classification = classifyKakaoRecruitMessage(message);
  const party = parseFinishRecruitCommand(message);
  const scrimAction = parseScrimAction(message);
  const scrim = parseScrimNumberCommand(message);

  console.log(
    [
      item.name,
      `kind=${classification.kind}`,
      `party=${party?.recruitNo ?? "-"}`,
      `scrimAction=${scrimAction ?? "-"}`,
      `scrim=${scrim?.scrimNo ?? "-"}`,
    ].join(" | "),
  );

  if (classification.kind !== item.kind) {
    failures.push(`${item.name}: expected ${item.kind}, got ${classification.kind}`);
  }

  if (item.name.includes("disabled") && scrimAction !== null) {
    failures.push(`${item.name}: disabled scrim close parsed as ${scrimAction}`);
  }

  if (item.partyNo !== undefined && party?.recruitNo !== item.partyNo) {
    failures.push(`${item.name}: expected party #${item.partyNo}, got ${party?.recruitNo ?? "none"}`);
  }

  if (item.partyNo === undefined && item.kind !== "PARTY_RECRUIT" && party) {
    failures.push(`${item.name}: unexpected party parser match #${party.recruitNo}`);
  }

  if (item.scrimNo !== undefined && scrim?.scrimNo !== item.scrimNo) {
    failures.push(`${item.name}: expected scrim #${item.scrimNo}, got ${scrim?.scrimNo ?? "none"}`);
  }

  if (item.scrimNo === undefined && item.kind !== "SCRIM_RECRUIT" && scrim) {
    failures.push(`${item.name}: unexpected scrim parser match #${scrim.scrimNo}`);
  }
}

const submittedPromotionParty = parsePartyForm(
  [
    "📢 5인 파티 구인",
    "모집번호: #1",
    "",
    "1. 같은이름",
    "2. 같은이름",
    "3. 세번째",
    "4. 네번째",
    "5.",
    "예비: 2명",
    "예비 1. 1. 첫예비",
    "예비 2. 둘째예비",
  ].join("\n"),
  "PARTY_NUMBER",
  5,
);

if (!submittedPromotionParty) {
  failures.push("party reserve promotion: form was not parsed");
} else {
  const promotedMembers = promotePartySubstitutesAfterRemoval({
    previousMembers: [
      { name: "기존1", position: null, slotNo: 1, isSubstitute: false },
      { name: "기존2", position: null, slotNo: 2, isSubstitute: false },
      { name: "기존3", position: null, slotNo: 3, isSubstitute: false },
      { name: "기존4", position: null, slotNo: 4, isSubstitute: false },
      { name: "빠질사람", position: null, slotNo: 5, isSubstitute: false },
    ],
    submittedMembers: submittedPromotionParty.members,
    partyType: "PARTY_NUMBER",
    maxMembers: 5,
  });
  const promoted = promotedMembers.find(
    (member) => !member.isSubstitute && member.slotNo === 5,
  );
  const remainingReserve = promotedMembers.find(
    (member) => member.isSubstitute && member.slotNo === 1,
  );
  const duplicateNameCount = promotedMembers.filter(
    (member) => member.name === "같은이름",
  ).length;

  if (promoted?.name !== "첫예비") {
    failures.push(`party reserve promotion: expected 첫예비 in slot 5, got ${promoted?.name ?? "none"}`);
  }
  if (remainingReserve?.name !== "둘째예비") {
    failures.push(`party reserve renumber: expected 둘째예비 as reserve 1, got ${remainingReserve?.name ?? "none"}`);
  }
  if (duplicateNameCount !== 2) {
    failures.push(`party duplicate names: expected 2, got ${duplicateNameCount}`);
  }

  const shouldStayReserve = promotePartySubstitutesAfterRemoval({
    previousMembers: [
      { name: "기존1", position: null, slotNo: 1, isSubstitute: false },
      { name: "기존2", position: null, slotNo: 2, isSubstitute: false },
      { name: "기존3", position: null, slotNo: 3, isSubstitute: false },
      { name: "기존4", position: null, slotNo: 4, isSubstitute: false },
    ],
    submittedMembers: submittedPromotionParty.members,
    partyType: "PARTY_NUMBER",
    maxMembers: 5,
  });
  if (shouldStayReserve.some((member) => !member.isSubstitute && member.slotNo === 5)) {
    failures.push("party reserve promotion: pre-existing vacancy must not promote a reserve");
  }
}

const clearedReserveParty = parsePartyForm(
  [
    "#2 · 5인 파티 · 5/5",
    "시작시간: 지금",
    "》게임정보 : 증바",
    "예비: 1명",
    "",
    "1. 재현",
    "2. 근열",
    "3. 다예",
    "4. 정재",
    "5. 준석",
    "예비 1.",
  ].join("\n"),
  "PARTY_NUMBER",
  5,
);

if (!clearedReserveParty) {
  failures.push("party reserve clearing: form was not parsed");
} else if (clearedReserveParty.members.some((member) => member.isSubstitute)) {
  failures.push("party reserve clearing: summary row 예비: 1명 was parsed as a member");
}

if (cleanStoredSubstituteName("1. 1. 재현") !== "재현") {
  failures.push("stored reserve repair: nested numbering was not normalized");
}
if (cleanStoredSubstituteName("1명") !== "") {
  failures.push("stored reserve repair: summary placeholder was not removed");
}

const linePartyPromotion = promotePartySubstitutesAfterRemoval({
  previousMembers: [
    { name: "기존탑", position: "TOP", slotNo: null, isSubstitute: false },
    { name: "기존정글", position: "JUG", slotNo: null, isSubstitute: false },
  ],
  submittedMembers: [
    { name: "기존정글", position: "JUG", slotNo: null, isSubstitute: false },
    { name: "첫예비", position: null, slotNo: 1, isSubstitute: true },
    { name: "둘째예비", position: null, slotNo: 2, isSubstitute: true },
  ],
  partyType: "PARTY_RIFT",
  maxMembers: 5,
});
if (!linePartyPromotion.some((member) => member.position === "TOP" && member.name === "첫예비")) {
  failures.push("line party reserve promotion: first reserve should fill removed TOP");
}
if (!linePartyPromotion.some((member) => member.isSubstitute && member.slotNo === 1 && member.name === "둘째예비")) {
  failures.push("line party reserve promotion: remaining reserve should be renumbered to 1");
}
if (linePartyPromotion.some((member) => member.position === "MID")) {
  failures.push("line party reserve promotion: pre-existing empty MID must stay empty");
}

const duplicateSeasonNames = parseRecruitMessage(
  [
    "[K-LOL.GG 내전구인 양식]",
    "오늘 21:00",
    "1. 같은이름 / 골드 / 플레 / TOP",
    "2. 같은이름 / 실버 / 골드 / MID",
    "예비 1. 같은이름 / 브론즈 / 실버 / SUP",
  ].join("\n"),
  new Date("2026-07-24T12:00:00.000Z"),
);
if (duplicateSeasonNames.participants.length !== 3) {
  failures.push(
    `season duplicate names: expected all 3 slots, got ${duplicateSeasonNames.participants.length}`,
  );
}
if (duplicateSeasonNames.warnings.some((warning) => warning.includes("중복되어"))) {
  failures.push("season duplicate names: duplicate-name warning must not remove a valid slot");
}

const emptySeasonForm = parseRecruitMessage(
  [
    "[K-LOL.GG 내전구인 양식]",
    "오늘 21:00",
    "1.",
    "2.",
    "예비 1.",
  ].join("\n"),
  new Date("2026-07-24T12:00:00.000Z"),
);
if (emptySeasonForm.participants.length !== 0) {
  failures.push("season empty form: clearing the final participant must produce an empty snapshot");
}

const scrimTemplate = buildScrimRecruitTemplate();
const scrimOperationDate = getScrimRecruitDateKey();
if (!scrimTemplate.includes(`운영일: ${scrimOperationDate}`)) {
  failures.push("scrim template: operation date is missing");
}
if (!scrimTemplate.includes("번호: #자동배정")) {
  failures.push("scrim template: initial number must be auto-assigned on submit");
}
const parsedScrimTemplate = parseScrimCreateCommand(
  scrimTemplate
    .replace("일시: ", "일시: 21:00")
    .replace("우리팀: ", "우리팀: 테스트팀")
    .replace("TOP: ", "TOP: 탑유저"),
);
if (!parsedScrimTemplate || parsedScrimTemplate.operationDate !== scrimOperationDate) {
  failures.push("scrim template: operation date did not survive form parsing");
}
if (parsedScrimTemplate?.scrimNo !== null) {
  failures.push("scrim template: #자동배정 must not parse as a fixed number");
}

const legacyNumberedScrim = parseScrimCreateCommand(
  scrimTemplate
    .replace(`운영일: ${scrimOperationDate}\n`, "")
    .replace("번호: #자동배정", "번호: #1")
    .replace("일시: ", "일시: 21:00")
    .replace("우리팀: ", "우리팀: 이전양식팀")
    .replace("TOP: ", "TOP: 탑유저"),
);
if (!legacyNumberedScrim || legacyNumberedScrim.scrimNo !== 1) {
  failures.push("scrim stale form guard: legacy numbered form must remain detectable");
}
if (legacyNumberedScrim?.operationDate !== null) {
  failures.push("scrim stale form guard: legacy numbered form must not invent an operation date");
}

if (!getKakaoMessageValidationError("x".repeat(MAX_KAKAO_MESSAGE_LENGTH + 1))) {
  failures.push("Kakao input guard: oversized messages must be rejected");
}
if (normalizeKakaoIdentity(` 방이름\u0000${"x".repeat(300)}`)?.length !== 200) {
  failures.push("Kakao input guard: room/sender identity must be sanitized and limited");
}
if (normalizeKakaoRequestId("kakao:123456:987654") !== "kakao:123456:987654") {
  failures.push("Kakao request id: valid id was rejected");
}
if (normalizeKakaoRequestId("잘못된 요청 ID") !== null) {
  failures.push("Kakao request id: invalid id was accepted");
}

if (getKstOperationDateKey(new Date("2026-07-24T20:59:00.000Z")) !== "2026-07-24") {
  failures.push("Kakao operation date should remain previous day before 06:00 KST");
}
if (getKstOperationDateKey(new Date("2026-07-24T21:00:00.000Z")) !== "2026-07-25") {
  failures.push("Kakao operation date should roll over at 06:00 KST");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Kakao recruit routing checks passed.");
