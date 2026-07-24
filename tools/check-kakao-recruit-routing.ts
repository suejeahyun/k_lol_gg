import { parseScrimAction, parseScrimNumberCommand } from "../src/lib/kakao/destruction-scrim-recruit";
import { parseFinishRecruitCommand, parsePartyForm } from "../src/lib/kakao/party-recruit";
import { classifyKakaoRecruitMessage } from "../src/lib/kakao/recruit-message-kind";
import { getKstOperationDateKey } from "../src/lib/date/kst";

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

const promotedParty = parsePartyForm(
  [
    "📢 5인 파티 구인",
    "모집번호: #1",
    "",
    "1. 같은이름",
    "2. 같은이름",
    "3. 세번째",
    "4. 네번째",
    "5.",
    "예비 1. 첫예비",
    "예비 2. 둘째예비",
  ].join("\n"),
  "PARTY_NUMBER",
  5,
);

if (!promotedParty) {
  failures.push("party reserve promotion: form was not parsed");
} else {
  const promoted = promotedParty.members.find(
    (member) => !member.isSubstitute && member.slotNo === 5,
  );
  const remainingReserve = promotedParty.members.find(
    (member) => member.isSubstitute && member.slotNo === 1,
  );
  const duplicateNameCount = promotedParty.members.filter(
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
