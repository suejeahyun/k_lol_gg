import type { KakaoOpenChatStatusDto } from "../kakao-assistant/domain";
import { partyCopyReference } from "../application/party-copy-reference";

type Party = KakaoOpenChatStatusDto["parties"][number];

const LINE_POSITIONS = ["TOP", "JUG", "MID", "ADC", "SUP"] as const;

function activeMembers(party: Party) {
  return party.members.filter((member) => !member.substitute && member.name.trim() !== "");
}

function reserveMembers(party: Party) {
  return party.members
    .filter((member) => member.substitute)
    .filter((member) => member.name !== "")
    .sort((left, right) => left.slotNo - right.slotNo);
}

function reserveSlotLines(reserves: readonly Pick<Party["members"][number], "slotNo" | "name">[]) {
  let blank = 1;
  while (reserves.some((member) => member.slotNo === blank)) blank += 1;
  const slots = [...reserves, ...(blank <= 99 ? [{ slotNo: blank, name: "" }] : [])];
  return slots.sort((left, right) => left.slotNo - right.slotNo)
    .map((member) => `예비 ${member.slotNo}.${member.name ? ` ${member.name}` : ""}`);
}

function isLineParty(type: Party["type"] | string) {
  return type === "FLEX_RANK" || type === "NORMAL_GAME" || type === "PARTY_RIFT";
}

function compactTitle(party: Pick<Party, "type" | "title" | "maximumMembers">) {
  const fallback = party.type === "FLEX_RANK" ? "자랭"
    : party.type === "NORMAL_GAME" ? "일반"
      : party.type === "SOLO_RANK" ? "솔랭"
        : party.type === "ARAM" ? "칼바람"
          : party.type === "TFT_NORMAL" ? "롤체 일반"
            : party.type === "TFT_RANK" ? "롤체 랭크"
              : party.type === "DOUBLE_UP" ? "더블업"
                : party.type === "PARTY_RIFT" ? "협곡파티"
                  : party.type === "OTHER_GAME" ? "기타게임"
                    : `${party.maximumMembers}인 파티`;
  return String(party.title || fallback)
    .replace(/!+$/gu, "")
    .replace(/\s*구인\s*$/gu, "")
    .replace(/\s*하실분\s*$/gu, "")
    .trim() || `${party.maximumMembers}인 파티`;
}

// Overview fields are shortened while stored values and details remain intact.
// All 99 party numbers fit in fewer than 12,000 UTF-16 code units.
function summaryText(value: string | null | undefined, maximum: number) {
  const text = String(value ?? "").trim().replace(/\s+/gu, " ") || "미정";
  if (text.length <= maximum) return text;
  let result = "";
  for (const character of text) {
    if (result.length + character.length > maximum - 1) break;
    result += character;
  }
  return result + "…";
}

function summary(party: Party) {
  const reserves = reserveMembers(party).length;
  return [
    `[파티 #${party.recruitNumber}] ${summaryText(compactTitle(party), 18)} · ${summaryText(party.startTimeText, 12)} · ${summaryText(party.gameInfo === "미입력" ? "미정" : party.gameInfo, 16)} · ${activeMembers(party).length}/${party.maximumMembers}명${reserves ? ` · 예비 ${reserves}명` : ""}`,
    `└ 구인상세 ${party.recruitNumber}`,
  ].join("\n");
}

function editableMetadata(value: string | null | undefined) {
  return value === "미정" || value === "미입력" ? "" : value ?? "";
}

function detailBlock(party: Party) {
  const reserves = reserveMembers(party);
  const copyTitle = compactTitle({ ...party, title: party.type === "ARAM" && /증바람/u.test(party.title) ? "증바람" : "" });
  const lines = [
    `#${party.recruitNumber} · ${copyTitle} · ${Math.min(activeMembers(party).length, party.maximumMembers)}/${party.maximumMembers}`,
    `운영일: ${party.recruitDate}`,
    `》저장기준 : ${partyCopyReference(party)}`,
    `》시작시간 : ${party.startTimeText ?? ""}`,
    `》게임정보 : ${party.gameInfo ?? ""}`,
    `》주최자 : ${party.organizerText ?? ""}`,
  ];
  if (reserves.length > 0) lines.push(`예비: ${reserves.length}명`);
  lines.push("");
  if (isLineParty(party.type)) {
    for (const [index, position] of LINE_POSITIONS.entries()) {
      // Slot patches are keyed by slotNo, including older rows with missing or
      // inconsistent position metadata. Keep every name in its stored slot.
      const member = party.members.find((item) => !item.substitute && item.slotNo === index + 1);
      lines.push(`${position}.${member?.name ? ` ${member.name}` : ""}`);
    }
  } else {
    for (let slotNo = 1; slotNo <= party.maximumMembers; slotNo += 1) {
      const member = party.members.find((item) => !item.substitute && item.slotNo === slotNo);
      lines.push(`${slotNo}.${member?.name ? ` ${member.name}` : ""}`);
    }
  }
  lines.push(...reserveSlotLines(reserves));
  lines.push("", "복사 안내: 전체 복사 → 빈칸에 이름 입력 → 전체 전송으로 저장 (저장기준 유지)");
  return lines.join("\n");
}

function compactCopyForm(party: Pick<Party, "recruitNumber" | "type" | "title" | "maximumMembers" | "members" | "startTimeText" | "gameInfo">, formCode: string) {
  const main = party.members.filter((member) => !member.substitute);
  const reserves = party.members.filter((member) => member.substitute).sort((a, b) => a.slotNo - b.slotNo);
  const title = compactTitle({ ...party, title: party.type === "ARAM" && /증바람/u.test(party.title) ? "증바람" : "" });
  const editable = party.type === "PARTY_NUMBER";
  const lines = [
    `[파티 #${party.recruitNumber}] ${title} · ${main.length}/${party.maximumMembers}명`,
    ...(editable ? [`양식코드: ${formCode}`, "──────────────",
      `시작 시간 : ${editableMetadata(party.startTimeText)}`, `게임 종류 : ${editableMetadata(party.gameInfo)}`]
      : [`시작: ${party.startTimeText ?? "미정"}`, `게임: ${party.gameInfo ?? "미정"}`]),
    "",
  ];
  for (let slot = 1; slot <= party.maximumMembers; slot += 1) {
    const name = main.find((member) => member.slotNo === slot)?.name;
    const label = isLineParty(party.type) ? LINE_POSITIONS[slot - 1] : String(slot);
    lines.push(`${label}.${name ? ` ${name}` : ""}`);
  }
  lines.push("");
  lines.push(...reserveSlotLines(reserves));
  if (!editable) lines.push("", `양식코드: ${formCode}`);
  return lines.join("\n");
}

export function v1StrictPartyTemplate(input: Readonly<{
  recruitNumber: number;
  recruitDate: string;
  partyType: Party["type"];
  title: string;
  maximumMembers: number;
  id?: string;
  revision?: number;
  formCode?: string;
}>) {
  if (input.formCode) return compactCopyForm({
    recruitNumber: input.recruitNumber, type: input.partyType, title: input.title,
    maximumMembers: input.maximumMembers, members: [], startTimeText: "미정", gameInfo: "미정",
  }, input.formCode);
  const lines = [
    `[K-LOL.GG 구인상세 #${input.recruitNumber}]`, "",
    `#${input.recruitNumber} · ${input.title.replace(/\s*구인\s*$/u, "")} · 0/${input.maximumMembers}`,
    `운영일: ${input.recruitDate}`,
    ...(input.id ? [`》저장기준 : ${partyCopyReference({ id: input.id, recruitDate: input.recruitDate, revision: input.revision ?? 0 })}`] : []),
    "》시작시간 :", "》게임정보 :", "》주최자 :", "",
    ...(isLineParty(input.partyType) ? LINE_POSITIONS.map((position) => `${position}.`) : Array.from({ length: input.maximumMembers }, (_, index) => `${index + 1}.`)),
    "예비 1.", "",
    "복사 안내: 전체 복사 → 빈칸에 이름 입력 → 전체 전송으로 저장 (저장기준 유지)",
  ];
  return lines.join("\n");
}

export function v1StrictPartyStatusReply(parties: readonly Party[], now = new Date()) {
  // Preserve the old optional argument; time/fullness no longer groups a party.
  void now;
  const active = parties.filter((party) => party.status === "IN_PROGRESS")
    .toSorted((left, right) => left.recruitNumber - right.recruitNumber);
  return ["📋 현재 구인", "", active.length
    ? active.map(summary).join("\n\n")
    : "현재 모집 중인 파티가 없습니다."].join("\n");
}

export function v1StrictPartyDetailReply(party: Party | null, recruitNumber: number) {
  if (!party) return `[K-LOL.GG 구인상세]\n\n모집번호 #${recruitNumber} 구인글을 찾지 못했습니다.`;
  if (party.formCode) return compactCopyForm(party, party.formCode);
  return [`[K-LOL.GG 구인상세 #${party.recruitNumber}]`, "", detailBlock(party)].join("\n");
}
