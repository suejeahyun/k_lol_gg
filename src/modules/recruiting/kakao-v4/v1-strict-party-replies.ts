import type { KakaoOpenChatStatusDto } from "../kakao-assistant/domain";

type Party = KakaoOpenChatStatusDto["parties"][number];
type DisplayGroup = "RECRUITING" | "WAITING" | "PLAYING" | "LARGE";

const LINE_POSITIONS = ["TOP", "JUG", "MID", "ADC", "SUP"] as const;

function activeMembers(party: Party) {
  return party.members.filter((member) => !member.substitute && member.name.trim() !== "");
}

function reserveMembers(party: Party) {
  return party.members
    .filter((member) => member.substitute)
    .map((member) => ({ ...member, name: member.name.replace(/^예비\s*/u, "").trim() }))
    .filter((member) => member.name !== "")
    .sort((left, right) => left.slotNo - right.slotNo);
}

function isLineParty(type: Party["type"] | string) {
  return type === "FLEX_RANK" || type === "NORMAL_GAME" || type === "PARTY_RIFT";
}

function isImmediateStart(value: string | null | undefined) {
  const text = String(value ?? "").replace(/\s+/gu, "").toLowerCase();
  if (!text) return false;
  return text.includes("모바시") || text.includes("모바") || text.includes("모이면바로") ||
    text.includes("모이면시작") || text.includes("모이면ㄱ") || text.includes("모이면고") ||
    text.includes("바로시작") || text.includes("즉시시작") || text.includes("지금시작") ||
    text.includes("지금바로") || text.includes("지금ㄱ") || text.includes("롸잇나우") ||
    text.includes("라잇나우") || text.includes("라이트나우") || text.includes("rightnow") ||
    text === "now" || text === "ㄱ" || text === "ㄱㄱ";
}

function clockMinutes(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?/u);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  if (match[1] === "오후" && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

function kstNowMinutes(now: Date) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function hasStarted(party: Party, now: Date) {
  if (isImmediateStart(party.startTimeText)) return true;
  if (party.scheduledStartAt) {
    const scheduled = new Date(party.scheduledStartAt);
    if (!Number.isNaN(scheduled.getTime())) return now.getTime() >= scheduled.getTime();
  }
  const minutes = clockMinutes(party.startTimeText);
  return minutes === null ? false : kstNowMinutes(now) >= minutes;
}

function displayGroup(party: Party, now: Date): DisplayGroup {
  if (hasStarted(party, now)) return "PLAYING";
  if (activeMembers(party).length >= party.maximumMembers) return "WAITING";
  if (party.maximumMembers >= 6) return "LARGE";
  return "RECRUITING";
}

function groupTitle(group: DisplayGroup) {
  if (group === "RECRUITING") return "[구인중]";
  if (group === "WAITING") return "[대기중]";
  if (group === "PLAYING") return "[진행중]";
  return "[대형파티]";
}

function compactTitle(party: Party) {
  const fallback = party.type === "FLEX_RANK" ? "자랭"
    : party.type === "NORMAL_GAME" ? "일반"
      : party.type === "SOLO_RANK" ? "솔랭"
        : party.type === "ARAM" ? "칼바람"
          : party.type === "TFT_NORMAL" ? "롤체 일반"
            : party.type === "TFT_RANK" ? "롤체 랭크"
              : party.type === "DOUBLE_UP" ? "더블업"
                : party.type === "PARTY_RIFT" ? "협곡파티"
                  : party.type === "OTHER_GAME" ? "기타게임"
                    : "파티";
  return String(party.title || fallback)
    .replace(/!+$/gu, "")
    .replace(/\s*구인\s*$/gu, "")
    .replace(/\s*하실분\s*$/gu, "")
    .trim() || `${party.maximumMembers}인 파티`;
}

function startTime(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "미정";
  if (isImmediateStart(text)) return "바로 시작";
  return text
    .replace(/(\d{1,2})\s*시\s*(\d{1,2})\s*분/gu, (_match, hour: string, minute: string) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)
    .replace(/(\d{1,2})\s*시(?!\s*간)/gu, (_match, hour: string) => `${String(hour).padStart(2, "0")}:00`)
    .replace(/(^|\D)0(\d):/gu, "$1$2:");
}

function gameInfo(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "미입력";
  return text
    .replace(/수준\s*예상/gu, "예상")
    .replace(
      /(구합니다|구함|구해요)\s+((?:아이언|브론즈|실버|골드|플래티넘|플래|플레|에메랄드|에메|다이아몬드|다이아|마스터|그랜드마스터|그마|챌린저)[^\n]*)/gu,
      "$1 / $2",
    )
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function memberSummary(party: Party) {
  const names = activeMembers(party).sort((left, right) => left.slotNo - right.slotNo).map((member) => member.name.trim());
  if (names.length === 0) return "참여: 없음";
  if (party.maximumMembers <= 5 || names.length <= 5) return `참여: ${names.join(", ")}`;
  return `참여: ${names.slice(0, 5).join(", ")} 외 ${names.length - 5}명`;
}

function summary(party: Party) {
  return [
    `#${party.recruitNumber} · ${compactTitle(party)} · ${Math.min(activeMembers(party).length, party.maximumMembers)}/${party.maximumMembers} · ${startTime(party.startTimeText)} · ${gameInfo(party.gameInfo)}`,
    memberSummary(party),
    `└ 상세 ${party.recruitNumber}`,
  ].join("\n");
}

function detailBlock(party: Party) {
  const reserves = reserveMembers(party);
  const lines = [
    `#${party.recruitNumber} · ${compactTitle(party)} · ${Math.min(activeMembers(party).length, party.maximumMembers)}/${party.maximumMembers}`,
    `시작시간: ${startTime(party.startTimeText)}`,
    `》게임정보 : ${gameInfo(party.gameInfo)}`,
  ];
  if (reserves.length > 0) lines.push(`예비: ${reserves.length}명`);
  lines.push("");
  if (isLineParty(party.type)) {
    const positionMap = { TOP: "TOP", JUG: "JGL", MID: "MID", ADC: "ADC", SUP: "SUP" } as const;
    for (const position of LINE_POSITIONS) {
      const member = party.members.find((item) => !item.substitute && item.position === positionMap[position]);
      lines.push(`${position}.${member?.name ? ` ${member.name}` : ""}`);
    }
  } else {
    for (let slotNo = 1; slotNo <= party.maximumMembers; slotNo += 1) {
      const member = party.members.find((item) => !item.substitute && item.slotNo === slotNo);
      lines.push(`${slotNo}.${member?.name ? ` ${member.name}` : ""}`);
    }
  }
  reserves.forEach((member, index) => lines.push(`예비 ${index + 1}. ${member.name}`));
  lines.push(`예비 ${reserves.length + 1}.`);
  return lines.join("\n");
}

export function v1StrictPartyTemplate(input: Readonly<{
  recruitNumber: number;
  partyType: Party["type"];
  title: string;
  maximumMembers: number;
}>) {
  const lines = [
    "[K-LOL.GG 구인구직 양식]", "같이 할사람~", "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.", "",
    `📢 ${input.title}`, `모집번호: #${input.recruitNumber}`, "",
    "》시작시간 :", "》게임정보 :", "",
  ];
  if (isLineParty(input.partyType)) lines.push("TOP.", "JUG.", "MID.", "ADC.", "SUP.");
  else for (let slotNo = 1; slotNo <= input.maximumMembers; slotNo += 1) lines.push(`${slotNo}.`);
  lines.push(
    "예비 1.", "",
    isLineParty(input.partyType) ? "마지막 참가자가 전체 태그 해주세요." : "참여해주실 분은 태그해주세요.",
    "*상호배려와 존중 부탁드립니다.",
  );
  return lines.join("\n");
}

export function v1StrictPartySyncReply(recruitNumber: number, maximumMembers: number, members: readonly Readonly<{ substitute: boolean }>[]) {
  const activeCount = members.filter((member) => !member.substitute).length;
  const reserveCount = members.length - activeCount;
  return [
    `[파티 #${recruitNumber} 반영]`,
    `${Math.min(activeCount, maximumMembers)}/${maximumMembers} · 예비 ${reserveCount}명`,
    `마감: ${recruitNumber}ㅉ`,
  ].join("\n");
}

export function v1StrictPartyStatusReply(parties: readonly Party[], now = new Date()) {
  if (parties.length === 0) return "[K-LOL.GG 구인구직 현황]\n\n현재 진행 중인 구인글이 없습니다.";
  const groups: Record<DisplayGroup, Party[]> = { RECRUITING: [], WAITING: [], PLAYING: [], LARGE: [] };
  for (const party of parties) groups[displayGroup(party, now)].push(party);
  const lines = ["[K-LOL.GG 구인구직 현황]", "🔎 전체 명단: 상세 번호", ""];
  for (const group of ["RECRUITING", "WAITING", "PLAYING", "LARGE"] as const) {
    if (groups[group].length === 0) continue;
    lines.push(groupTitle(group));
    for (const party of groups[group]) lines.push(summary(party));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function v1StrictPartyDetailReply(party: Party | null, recruitNumber: number) {
  if (!party) return `[K-LOL.GG 구인상세]\n\n모집번호 #${recruitNumber} 구인글을 찾지 못했습니다.`;
  return [
    `[K-LOL.GG 구인상세 #${party.recruitNumber}]`, "", detailBlock(party), "",
    "수정: 이 메시지를 복사해 이름을 고친 뒤 전체 전송",
    `마감: ${party.recruitNumber}ㅉ`,
  ].join("\n");
}
