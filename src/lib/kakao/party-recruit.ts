export type RecruitPartyType =
  | "FLEX_RANK"
  | "NORMAL_GAME"
  | "SOLO_RANK"
  | "ARAM"
  | "TFT_NORMAL"
  | "TFT_RANK"
  | "DOUBLE_UP"
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
  recruitDate: string;
  type: RecruitPartyType | string;
  status: RecruitPartyStatus | string;
  title: string;
  roomName: string | null;
  hostName: string | null;
  startTimeText: string | null;
  tierText?: string | null;
  preferredLineText?: string | null;
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
  tierText: string | null;
  preferredLineText: string | null;
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

const TIER_WORDS = [
  "아이언",
  "브론즈",
  "실버",
  "골드",
  "플래티넘",
  "플래",
  "플레",
  "에메랄드",
  "에메",
  "다이아몬드",
  "다이아",
  "마스터",
  "그랜드마스터",
  "그마",
  "챌린저",
  "언랭",
  "언랭크",
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "PLAT",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
  "UNRANKED",
  "I",
  "B",
  "S",
  "G",
  "P",
  "E",
  "D",
  "M",
  "GM",
  "C",
  "U",
];

const POSITION_WORDS = [
  "탑",
  "정글",
  "미드",
  "원딜",
  "바텀",
  "서폿",
  "서포터",
  "TOP",
  "JUG",
  "JGL",
  "JG",
  "MID",
  "ADC",
  "AD",
  "SUP",
  "SPT",
  "SUPPORT",
];


export function getKakaoRecruitDateKey(now = new Date()) {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffsetMs);
  const yyyy = kstNow.getUTCFullYear();
  const mm = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kstNow.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

export function getKakaoRecruitTodayRange(now = new Date()) {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffsetMs);
  const startUtcMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    0,
    0,
    0,
    0,
  ) - kstOffsetMs;

  return {
    gte: new Date(startUtcMs),
    lt: new Date(startUtcMs + 24 * 60 * 60 * 1000),
  };
}

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
  if (type === "TFT_NORMAL") return "롤체 일반";
  if (type === "TFT_RANK") return "롤체 랭크";
  if (type === "DOUBLE_UP") return "더블업";
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

export function isSoloRankPartyType(type: string) {
  return type === "SOLO_RANK";
}

export function parseCreateRecruitCommand(
  message: string,
): CreateRecruitCommand | null {
  const text = normalizeText(message).trim();
  const match = text.match(
    /^\/?(자랭구인|일반구인|솔랭구인|칼바람구인|증바람구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인)(?:\s+(\d{1,2}))?\s*$/,
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
      title: "솔랭 하실분!",
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
      template: buildNumberTemplate(label, recruitNo, 5, ["》게임 시작 시간"], true),
    };
  }

  if (command === "롤체일반구인") {
    return {
      recruitNo,
      type: "TFT_NORMAL",
      title: "롤체 일반 하실분!",
      maxMembers: 8,
      template: buildNumberTemplate("롤체 일반", recruitNo, 8, ["》게임 시작 시간"]),
    };
  }

  if (command === "롤체랭크구인") {
    return {
      recruitNo,
      type: "TFT_RANK",
      title: "롤체 랭크 하실분!",
      maxMembers: 3,
      template: buildNumberTemplate("롤체 랭크", recruitNo, 3, ["》게임 시작 시간"]),
    };
  }

  if (command === "더블업구인") {
    return {
      recruitNo,
      type: "DOUBLE_UP",
      title: "더블업 하실분!",
      maxMembers: 2,
      template: buildNumberTemplate("더블업", recruitNo, 2, ["》게임 시작 시간"]),
    };
  }

  return {
    recruitNo,
    type: "OTHER_GAME",
    title: "기타게임 하실분!",
    maxMembers: 8,
    template: buildNumberTemplate("기타게임", recruitNo, 8, ["》게임 시작 시간"]),
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
    "참여해주실 분은 태그해주세요.",
    "*상호배려와 존중 부탁드립니다.",
  );
  return lines.join("\n");
}

export function parseFinishRecruitCommand(
  message: string,
): FinishRecruitCommand | null {
  const text = normalizeText(message).trim();

  const shortMatch = text.match(/^\/?(\d{1,2})\s*(쫑|ㅉ)\s*$/);
  const commandMatch = text.match(/^\/?구인(?:마감|쫑|종료)\s*#?\s*(\d{1,2})\s*$/);
  const match = shortMatch || commandMatch;

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

  const meta = parseRecruitFormMetadata(text);
  const isSoloRank = isSoloRankPartyType(String(partyType));

  return {
    recruitNo,
    startTimeText: meta.startTimeText,
    tierText: isSoloRank ? meta.tierText : null,
    preferredLineText: isSoloRank ? meta.preferredLineText : null,
    playStyle: isSoloRank ? meta.playStyle : null,
    members: isLinePartyType(partyType)
      ? parseLineMembers(text)
      : parseNumberMembers(text, maxMembers),
  };
}

function cleanGuideValue(line: string, labelPattern: RegExp) {
  return line
    .replace(/[》>]/g, "")
    .replace(labelPattern, "")
    .replace(/[:：]/g, "")
    .trim();
}

function parseStartTimeAndTier(value: string) {
  let cleaned = value.replace(/\+\s*티어/g, "").trim();
  let tierText: string | null = null;

  for (const tier of TIER_WORDS) {
    const escaped = tier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = cleaned.match(new RegExp(`(?:^|\\s)(${escaped})(?:\\s*)$`, "i"));
    if (!match) continue;

    tierText = match[1].trim();
    cleaned = cleaned.slice(0, match.index).trim();
    break;
  }

  return {
    startTimeText: cleaned || null,
    tierText,
  };
}

function parsePreferredLineValue(value: string) {
  const cleaned = value
    .replace(/선호(?:하는)?\s*라인/g, "")
    .replace(/라인/g, "")
    .trim();

  if (!cleaned) return null;

  const matched = POSITION_WORDS.find((position) =>
    new RegExp(`(^|\\s)${position}($|\\s)`, "i").test(cleaned),
  );

  return matched || cleaned;
}

function parseRecruitFormMetadata(text: string) {
  const lines = normalizeText(text).split("\n");
  let startTimeText: string | null = null;
  let tierText: string | null = null;
  let preferredLineText: string | null = null;
  let playStyle: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.indexOf("게임 시작 시간") >= 0) {
      const value = cleanGuideValue(line, /게임\s*시작\s*시간/g);
      const parsed = parseStartTimeAndTier(value);
      startTimeText = parsed.startTimeText ?? startTimeText;
      tierText = parsed.tierText ?? tierText;
      continue;
    }

    if (line.indexOf("즐겜") >= 0 || line.indexOf("빡겜") >= 0) {
      const value = cleanGuideValue(line, /즐겜\s*&\s*빡겜\s*중에\s*선택/g);
      if (/즐겜/.test(value) && !/빡겜/.test(value)) playStyle = "즐겜";
      if (/빡겜/.test(value) && !/즐겜/.test(value)) playStyle = "빡겜";
      continue;
    }

    if (line.indexOf("선호") >= 0 && line.indexOf("라인") >= 0) {
      const value = cleanGuideValue(line, /듀오\s*선호(?:하는)?\s*라인/g);
      preferredLineText = parsePreferredLineValue(value) ?? preferredLineText;
    }
  }

  return {
    startTimeText,
    tierText,
    preferredLineText,
    playStyle,
  };
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

  const isSoloRank = isSoloRankPartyType(String(party.type));

  lines.push(`${titleLabel} ${statusLabel}`);
  if (party.startTimeText) lines.push(`시간 : ${party.startTimeText}`);
  if (isSoloRank && party.tierText) lines.push(`티어 : ${party.tierText}`);
  if (isSoloRank && (party.playStyle || party.preferredLineText)) {
    const detail = [
      party.playStyle,
      party.preferredLineText ? `${party.preferredLineText} 선호` : null,
    ]
      .filter(Boolean)
      .join(" ㅣ ");
    if (detail) lines.push(detail);
  }
  lines.push("");
  lines.push(`모집번호: #${party.recruitNo}`);
  lines.push(`현재 인원: ${activeCount}/${party.maxMembers}`);
  if (subMembers.length > 0) lines.push(`예비: ${subMembers.length}명`);
  lines.push("");

  if (isLinePartyType(String(party.type))) {
    for (const position of LINE_POSITIONS) {
      const member = party.members.find((item) => item.position === position);
      lines.push(`${position}. ${member?.name || ""}`);
    }
  } else {
    for (let slotNo = 1; slotNo <= party.maxMembers; slotNo += 1) {
      const member = party.members.find(
        (item) => !item.isSubstitute && item.slotNo === slotNo,
      );
      lines.push(`${slotNo}. ${member?.name || ""}`);
    }
    if (String(party.type) === "ARAM" || subMembers.length > 0) {
      lines.push(
        `예비. ${subMembers.map((item) => item.name).join(", ") || ""}`,
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
    return ["[K-LOL.GG 구인구직 등록 완료]", "같이 할사람~"].join("\n");
  }

  if (
    typeof previousActiveCount === "number" &&
    activeCount < previousActiveCount
  ) {
    return ["[K-LOL.GG 구인구직 반영 완료]", "다음에 또 같이해요."].join("\n");
  }

  return ["[K-LOL.GG 구인구직 반영 완료]", "변경사항이 반영되었습니다."].join(
    "\n",
  );
}

export function buildCreateReply(template: string, recruitNo?: number) {
  const fixedTemplate =
    typeof recruitNo === "number"
      ? template.replace("모집번호: #자동생성", `모집번호: #${recruitNo}`)
      : template;
  return [
    "[K-LOL.GG 구인구직 등록 완료]",
    "같이 할사람~",
    "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.",
    "",
    fixedTemplate,
  ].join("\n");
}
