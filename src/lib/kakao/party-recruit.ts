export type RecruitPartyType =
  | "FLEX_RANK"
  | "NORMAL_GAME"
  | "SOLO_RANK"
  | "ARAM"
  | "OTHER_GAME";
export type RecruitPartyStatus = "IN_PROGRESS" | "CANCELED";
export type RecruitLinePosition = "TOP" | "JUG" | "MID" | "ADC" | "SUP";

export type RecruitMemberLike = {
  name: string;
  position: string | null;
  slotNo: number | null;
  isSubstitute: boolean;
};

export type RecruitPartyLike = {
  id: number;
  recruitNo: number;
  type: RecruitPartyType | string;
  status: RecruitPartyStatus | string;
  title: string;
  roomName: string | null;
  hostName: string | null;
  startTimeText: string | null;
  playStyle: string | null;
  note: string | null;
  maxMembers: number;
  createdAt: Date;
  updatedAt: Date;
  members: RecruitMemberLike[];
};

export type CreateRecruitCommand = {
  recruitNo: number | null;
  type: RecruitPartyType;
  title: string;
  maxMembers: number;
  template: string;
};

export type FinishRecruitCommand = {
  recruitNo: number;
};

export type ParsedPartyForm = {
  recruitNo: number;
  startTimeText: string | null;
  playStyle: string | null;
  members: RecruitMemberLike[];
};

const LINE_POSITIONS: RecruitLinePosition[] = [
  "TOP",
  "JUG",
  "MID",
  "ADC",
  "SUP",
];

const POSITION_ALIASES: Record<string, RecruitLinePosition> = {
  TOP: "TOP",
  탑: "TOP",
  JUG: "JUG",
  JGL: "JUG",
  JG: "JUG",
  정글: "JUG",
  MID: "MID",
  미드: "MID",
  ADC: "ADC",
  AD: "ADC",
  원딜: "ADC",
  SUP: "SUP",
  SPT: "SUP",
  SUPPORT: "SUP",
  서폿: "SUP",
  서포터: "SUP",
};

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/　/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/／/g, "/")
    .replace(/：/g, ":")
    .replace(/０/g, "0")
    .replace(/１/g, "1")
    .replace(/２/g, "2")
    .replace(/３/g, "3")
    .replace(/４/g, "4")
    .replace(/５/g, "5")
    .replace(/６/g, "6")
    .replace(/７/g, "7")
    .replace(/８/g, "8")
    .replace(/９/g, "9")
    .replace(/\n{3,}/g, "\n\n");
}

function trimName(value: string) {
  return String(value || "")
    .replace(/^[.:：)\]\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidRecruitNo(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 99;
}

export function getRecruitTypeLabel(type: string) {
  if (type === "FLEX_RANK") return "자랭";
  if (type === "NORMAL_GAME") return "일반";
  if (type === "SOLO_RANK") return "솔랭";
  if (type === "ARAM") return "칼바람";
  if (type === "OTHER_GAME") return "기타게임";
  return "구인구직";
}

export function getRecruitStatusLabel(
  party: Pick<RecruitPartyLike, "type" | "maxMembers" | "members">,
) {
  const activeCount = getActiveMemberCount(party.members);
  return activeCount >= party.maxMembers ? "진행중" : "진행중 · 구인중";
}

export function getActiveMemberCount(members: RecruitMemberLike[]) {
  return members.filter(
    (member) => !member.isSubstitute && member.name.trim() !== "",
  ).length;
}

export function isLinePartyType(type: string) {
  return type === "FLEX_RANK" || type === "NORMAL_GAME";
}

export function parseCreateRecruitCommand(
  message: string,
): CreateRecruitCommand | null {
  const text = normalizeText(message).trim();
  const match = text.match(
    /^\/?(자랭구인|일반구인|솔랭구인|칼바람구인|증바람구인|기타게임구인)(?:\s+(\d{1,2}))?\s*$/,
  );
  if (!match) return null;

  const recruitNo = match[2] ? Number(match[2]) : null;
  if (recruitNo !== null && !isValidRecruitNo(recruitNo)) return null;

  const command = match[1];
  if (command === "자랭구인") {
    return {
      recruitNo,
      type: "FLEX_RANK",
      title: "자랭 하실분!",
      maxMembers: 5,
      template: buildLineTemplate("자랭", recruitNo),
    };
  }


  if (command === "일반구인") {
    return {
      recruitNo,
      type: "NORMAL_GAME",
      title: "일반 하실분!",
      maxMembers: 5,
      template: buildLineTemplate("일반", recruitNo),
    };
  }

  if (command === "솔랭구인") {
    return {
      recruitNo,
      type: "SOLO_RANK",
      title: "솔랭하실분!",
      maxMembers: 2,
      template: buildNumberTemplate("솔랭", recruitNo, 2, [
        "》게임 시작 시간 + 티어",
        "》즐겜 & 빡겜 중에 선택",
        "》듀오 선호하는 라인",
      ]),
    };
  }

  if (command === "칼바람구인" || command === "증바람구인") {
    const label = command === "증바람구인" ? "증바람" : "칼바람";
    return {
      recruitNo,
      type: "ARAM",
      title: `${label} 하실분!`,
      maxMembers: 5,
      template: buildNumberTemplate(
        label,
        recruitNo,
        5,
        ["》게임 시작 시간"],
        true,
      ),
    };
  }

  return {
    recruitNo,
    type: "OTHER_GAME",
    title: "기타게임 하실분!",
    maxMembers: 8,
    template: buildNumberTemplate("기타게임", recruitNo, 8, [
      "》게임 시작 시간",
    ]),
  };
}

function formatRecruitNoLine(recruitNo: number | null) {
  return recruitNo === null ? "모집번호: #자동생성" : `모집번호: #${recruitNo}`;
}

function buildLineTemplate(label: string, recruitNo: number | null) {
  return [
    `📢 ${label} 하실분!`,
    formatRecruitNoLine(recruitNo),
    "",
    "》게임 시작 시간",
    "》즐겜 & 빡겜 중에 선택",
    "",
    "TOP.",
    "JUG.",
    "MID.",
    "ADC.",
    "SUP.",
    "",
    "마지막 참가자가 전체 태그 해주세요.",
    "*상호배려와 존중 부탁드립니다.",
  ].join("\n");
}

function buildNumberTemplate(
  label: string,
  recruitNo: number | null,
  maxMembers: number,
  guides: string[],
  includeSubstitute = false,
) {
  const lines = [
    `📢 ${label} 하실분!`,
    formatRecruitNoLine(recruitNo),
    "",
    ...guides,
    "",
  ];
  for (let slotNo = 1; slotNo <= maxMembers; slotNo += 1) {
    lines.push(`${slotNo}.`);
  }
  if (includeSubstitute) lines.push("예비.");
  lines.push(
    "",
    "참여해주실분은 태그해주세요",
    "*상호배려와 존중 부탁드립니다.",
  );
  return lines.join("\n");
}

export function parseFinishRecruitCommand(
  message: string,
): FinishRecruitCommand | null {
  const text = normalizeText(message).trim();
  const match = text.match(/^\/?(\d{1,2})\s*(쫑|ㅉ)\s*$/);
  if (!match) return null;

  const recruitNo = Number(match[1]);
  if (!isValidRecruitNo(recruitNo)) return null;
  return { recruitNo };
}

export function extractRecruitNoFromForm(message: string) {
  const text = normalizeText(message);
  const explicit = text.match(/모집번호\s*[:：]?\s*#?\s*(\d{1,2})/);
  const fallback = text.match(/(^|\s)#(\d{1,2})(\s|$)/);
  const value = explicit
    ? Number(explicit[1])
    : fallback
      ? Number(fallback[2])
      : NaN;
  return isValidRecruitNo(value) ? value : null;
}

export function looksLikeRecruitPartyForm(message: string) {
  const text = normalizeText(message);
  if (extractRecruitNoFromForm(text) === null) return false;
  return (
    /(^|\n)\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]?/i.test(
      text,
    ) || /(^|\n)\s*\d{1,2}\s*[.)]?/.test(text)
  );
}

export function parsePartyForm(
  message: string,
  partyType: string,
  maxMembers: number,
): ParsedPartyForm | null {
  const text = normalizeText(message);
  const recruitNo = extractRecruitNoFromForm(text);
  if (recruitNo === null) return null;

  return {
    recruitNo,
    startTimeText: parseStartTimeText(text),
    playStyle: parsePlayStyle(text),
    members: isLinePartyType(partyType)
      ? parseLineMembers(text)
      : parseNumberMembers(text, maxMembers),
  };
}

function parseStartTimeText(text: string) {
  const lines = normalizeText(text).split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.indexOf("게임 시작 시간") < 0) continue;
    const cleaned = line
      .replace(/[》>]/g, "")
      .replace(/게임\s*시작\s*시간/g, "")
      .replace(/\+\s*티어/g, "")
      .replace(/[:：]/g, "")
      .trim();
    return cleaned || null;
  }
  return null;
}

function parsePlayStyle(text: string) {
  const compact = normalizeText(text);
  if (compact.includes("즐겜") && compact.includes("빡겜")) return null;
  if (compact.includes("즐겜")) return "즐겜";
  if (compact.includes("빡겜")) return "빡겜";
  return null;
}

function parseLineMembers(text: string): RecruitMemberLike[] {
  const members: RecruitMemberLike[] = [];
  const lines = normalizeText(text).split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(
      /^(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]?\s*(.*)$/i,
    );
    if (!match) continue;

    const alias = match[1].toUpperCase();
    const position = POSITION_ALIASES[alias] || POSITION_ALIASES[match[1]];
    if (!position) continue;

    const name = trimName(match[2]);
    if (!name) continue;
    members.push({ name, position, slotNo: null, isSubstitute: false });
  }

  const unique = new Map<string, RecruitMemberLike>();
  for (const member of members) {
    if (member.position) unique.set(member.position, member);
  }
  return [...unique.values()].sort(
    (a, b) =>
      LINE_POSITIONS.indexOf(a.position as RecruitLinePosition) -
      LINE_POSITIONS.indexOf(b.position as RecruitLinePosition),
  );
}

function parseNumberMembers(
  text: string,
  maxMembers: number,
): RecruitMemberLike[] {
  const members: RecruitMemberLike[] = [];
  const lines = normalizeText(text).split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const subMatch = line.match(/^예비\s*[.:：]?\s*(.*)$/);
    if (subMatch) {
      const names = splitNames(subMatch[1]);
      for (const name of names) {
        members.push({
          name,
          position: null,
          slotNo: null,
          isSubstitute: true,
        });
      }
      continue;
    }

    const match = line.match(/^(\d{1,2})\s*[.)]?\s*(.*)$/);
    if (!match) continue;

    const slotNo = Number(match[1]);
    if (!Number.isInteger(slotNo) || slotNo < 1 || slotNo > maxMembers)
      continue;

    const name = trimName(match[2]);
    if (!name) continue;
    members.push({ name, position: null, slotNo, isSubstitute: false });
  }

  const unique = new Map<string, RecruitMemberLike>();
  for (const member of members) {
    if (member.isSubstitute) {
      unique.set(`sub-${member.name}`, member);
    } else {
      unique.set(`slot-${member.slotNo}`, member);
    }
  }
  return [...unique.values()].sort(
    (a, b) => Number(a.slotNo ?? 999) - Number(b.slotNo ?? 999),
  );
}

function splitNames(value: string) {
  const cleaned = trimName(value);
  if (!cleaned) return [];
  return cleaned
    .split(/[,，\/]+/)
    .map((item) => trimName(item))
    .filter(Boolean);
}

export function formatRecruitPartyBlock(party: RecruitPartyLike) {
  const statusLabel = getRecruitStatusLabel(party);
  const titleLabel = String(
    party.title || getRecruitTypeLabel(String(party.type)),
  ).replace(/!+$/, "");
  const activeCount = getActiveMemberCount(party.members);
  const subMembers = party.members.filter((member) => member.isSubstitute);
  const lines: string[] = [];

  lines.push(`${titleLabel} ${statusLabel}`);
  lines.push(`모집번호: #${party.recruitNo}`);
  if (party.startTimeText) lines.push(`게임 시작 시간: ${party.startTimeText}`);
  lines.push(`현재 인원: ${activeCount}/${party.maxMembers}`);
  if (subMembers.length > 0) lines.push(`예비: ${subMembers.length}명`);
  lines.push("");

  if (isLinePartyType(String(party.type))) {
    for (const position of LINE_POSITIONS) {
      const member = party.members.find((item) => item.position === position);
      lines.push(`${position}. ${member?.name || "-"}`);
    }
  } else {
    for (let slotNo = 1; slotNo <= party.maxMembers; slotNo += 1) {
      const member = party.members.find(
        (item) => !item.isSubstitute && item.slotNo === slotNo,
      );
      lines.push(`${slotNo}. ${member?.name || "-"}`);
    }
    if (String(party.type) === "ARAM" || subMembers.length > 0) {
      lines.push(
        `예비. ${subMembers.map((item) => item.name).join(", ") || "-"}`,
      );
    }
  }

  return lines.join("\n");
}

export function buildRecruitStatusReply(parties: RecruitPartyLike[]) {
  if (parties.length === 0) {
    return [
      "[K-LOL.GG 구인구직 현황]",
      "",
      "현재 모집중이거나 진행중인 구인글이 없습니다.",
      "",
      "현황 보기:",
      "https://k-lol-gg.vercel.app/recruit",
    ].join("\n");
  }

  return [
    "[K-LOL.GG 구인구직 현황]",
    "",
    parties
      .map(formatRecruitPartyBlock)
      .join("\n\n------------------------------------\n\n"),
    "",
    "------------------------------------",
    "",
    "현황 보기:",
    "https://k-lol-gg.vercel.app/recruit",
  ].join("\n");
}

export function buildSyncReply(
  party: RecruitPartyLike,
  previousActiveCount?: number,
) {
  const activeCount = getActiveMemberCount(party.members);

  if (
    typeof previousActiveCount === "number" &&
    activeCount > previousActiveCount
  ) {
    return ["[K-LOL 구인구직 등록 완료]", "같이 할사람~"].join("\n");
  }

  if (
    typeof previousActiveCount === "number" &&
    activeCount < previousActiveCount
  ) {
    return ["[K-LOL 구인구직 반영 완료]", "다음에 또 같이해요."].join("\n");
  }

  return ["[K-LOL 구인구직 반영 완료]", "변경사항이 반영되었습니다."].join(
    "\n",
  );
}

export function buildCreateReply(template: string, recruitNo?: number) {
  const fixedTemplate =
    typeof recruitNo === "number"
      ? template.replace("모집번호: #자동생성", `모집번호: #${recruitNo}`)
      : template;
  return [
    "[K-LOL 구인구직 등록 완료]",
    "같이 할사람~",
    "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.",
    "",
    fixedTemplate,
  ].join("\n");
}
