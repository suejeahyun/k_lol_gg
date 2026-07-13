import { parseScrimAction, parseScrimNumberCommand } from "../src/lib/kakao/destruction-scrim-recruit";
import { parseFinishRecruitCommand } from "../src/lib/kakao/party-recruit";
import { classifyKakaoRecruitMessage } from "../src/lib/kakao/recruit-message-kind";

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
  { name: "scrim close compact", raw: "\\uC2A4\\uD06C\\uB9BC1\\u3149", kind: "SCRIM_RECRUIT", scrimNo: 1 },
  { name: "scrim close spaced", raw: "\\uC2A4\\uD06C\\uB9BC \\uCAD1 2", kind: "SCRIM_RECRUIT", scrimNo: 2 },
  { name: "scrim close command", raw: "/\\uC2A4\\uD06C\\uB9BC\\uC885\\uB8CC 3", kind: "SCRIM_RECRUIT", scrimNo: 3 },
  { name: "scrim status", raw: "\\uC2A4\\uD06C\\uB9BC\\uD604\\uD669", kind: "SCRIM_RECRUIT" },
  { name: "season status", raw: "\\uB0B4\\uC804\\uD604\\uD669", kind: "SEASON_RECRUIT" },
  { name: "season reset", raw: "\\uC624\\uB298\\uB0B4\\uC804\\uCD08\\uAE30\\uD654", kind: "SEASON_RECRUIT" },
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

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Kakao recruit routing checks passed.");
