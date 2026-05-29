export type RecruitPartyType =
  | "FLEX_RANK"
  | "NORMAL_GAME"
  | "SOLO_RANK"
  | "ARAM"
  | "TFT_NORMAL"
  | "TFT_RANK"
  | "DOUBLE_UP"
  | "PARTY_NUMBER"
  | "PARTY_RIFT"
  | "OTHER_GAME";
export type RecruitPartyStatus =
  | "IN_PROGRESS"
  | "FINISHED"
  | "CANCELED"
  | "RESET";
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
  resetSeq?: number;
  recruitCode?: string | null;
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
  note: string | null;
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
  const startUtcMs =
    Date.UTC(
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

function isValidPartyMemberCount(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 99;
}

export function buildRecruitPartyCode(params: {
  recruitDate: string;
  maxMembers: number;
  recruitNo: number;
}) {
  return `${params.recruitDate}-${params.maxMembers}-${params.recruitNo}`;
}

export function getRecruitTypeLabel(type: string) {
  if (type === "FLEX_RANK") return "자랭";
  if (type === "NORMAL_GAME") return "일반";
  if (type === "SOLO_RANK") return "솔랭";
  if (type === "ARAM") return "칼바람";
  if (type === "TFT_NORMAL") return "롤체 일반";
  if (type === "TFT_RANK") return "롤체 랭크";
  if (type === "DOUBLE_UP") return "더블업";
  if (type === "PARTY_NUMBER") return "파티";
  if (type === "PARTY_RIFT") return "협곡파티";
  if (type === "OTHER_GAME") return "기타게임";
  return "구인구직";
}

export type RecruitDisplayGroup =
  | "RECRUITING"
  | "WAITING"
  | "PLAYING"
  | "LARGE";

function parseKakaoTimeToMinutes(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;

  const match = text.match(/(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?/);
  if (!match) return null;

  let hour = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : 0;

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;

  if (match[1] === "오후" && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;
  if (hour === 24) hour = 0;

  return hour * 60 + minute;
}

function getKakaoNowMinutes(now = new Date()) {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffsetMs);
  return kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
}

function isImmediateStartText(value: string | null | undefined) {
  const text = normalizeText(String(value || ""))
    .replace(/\s+/g, "")
    .toLowerCase();

  if (!text) return false;

  return (
    text.includes("모바시") ||
    text.includes("모바") ||
    text.includes("모이면바로") ||
    text.includes("모이면시작") ||
    text.includes("모이면ㄱ") ||
    text.includes("모이면고") ||
    text.includes("바로시작") ||
    text.includes("즉시시작") ||
    text.includes("지금시작") ||
    text.includes("지금바로") ||
    text.includes("지금ㄱ") ||
    text.includes("롸잇나우") ||
    text.includes("라잇나우") ||
    text.includes("라이트나우") ||
    text.includes("rightnow") ||
    text === "now" ||
    text === "ㄱ" ||
    text === "ㄱㄱ"
  );
}

export function isRecruitPartyStarted(
  party: Pick<RecruitPartyLike, "startTimeText">,
  now = new Date(),
) {
  if (isImmediateStartText(party.startTimeText)) return true;

  const startMinutes = parseKakaoTimeToMinutes(party.startTimeText);
  if (startMinutes === null) return false;

  return getKakaoNowMinutes(now) >= startMinutes;
}

export function getRecruitDisplayGroup(
  party: Pick<RecruitPartyLike, "maxMembers" | "members" | "startTimeText">,
  now = new Date(),
): RecruitDisplayGroup {
  if (isRecruitPartyStarted(party, now)) return "PLAYING";

  const activeCount = getActiveMemberCount(party.members);
  if (activeCount >= party.maxMembers) return "WAITING";
  if (party.maxMembers >= 6) return "LARGE";
  return "RECRUITING";
}

export function getRecruitStatusLabel(
  party: Pick<RecruitPartyLike, "maxMembers" | "members" | "startTimeText">,
) {
  const group = getRecruitDisplayGroup(party);
  if (group === "WAITING") return "진행중 · 대기중";
  if (group === "PLAYING") return "진행중 · 진행중";
  return "진행중 · 구인중";
}

function getRecruitGroupTitle(group: RecruitDisplayGroup) {
  if (group === "RECRUITING") return "[구인중]";
  if (group === "WAITING") return "[대기중]";
  if (group === "PLAYING") return "[진행중]";
  return "[대형파티]";
}

function getRecruitGroupOrder(group: RecruitDisplayGroup) {
  if (group === "RECRUITING") return 1;
  if (group === "WAITING") return 2;
  if (group === "PLAYING") return 3;
  return 4;
}

export function getActiveMemberCount(members: RecruitMemberLike[]) {
  return members.filter(
    (member) => !member.isSubstitute && member.name.trim() !== "",
  ).length;
}

export function getDisplayActiveMemberCount(
  members: RecruitMemberLike[],
  maxMembers: number,
) {
  return Math.min(getActiveMemberCount(members), maxMembers);
}

export function isRecruitPartyFull(
  party: Pick<RecruitPartyLike, "maxMembers" | "members">,
) {
  return getActiveMemberCount(party.members) >= party.maxMembers;
}

export function filterRecruitingParties<
  T extends Pick<RecruitPartyLike, "maxMembers" | "members">,
>(parties: T[]) {
  // 구인현황에서는 인원이 가득 찬 파티도 출발 전/진행 중 확인용으로 노출합니다.
  // 실제 숨김 기준은 RecruitParty.status가 FINISHED/CANCELED/RESET인 경우입니다.
  return parties;
}

export function isLinePartyType(type: string) {
  return (
    type === "FLEX_RANK" || type === "NORMAL_GAME" || type === "PARTY_RIFT"
  );
}

export function isSoloRankPartyType(type: string) {
  return type === "SOLO_RANK";
}

export function parseCreateRecruitCommand(
  message: string,
): CreateRecruitCommand | null {
  const text = normalizeText(message).trim();
  const partyMatch = text.match(
    /^\/?(\d{1,2})\s*인\s*(협곡)?\s*(?:파티|구인)(?:\s+(\d{1,2}))?\s*$/,
  );

  if (partyMatch) {
    const memberCount = Number(partyMatch[1]);
    const isRiftParty = Boolean(partyMatch[2]);
    const recruitNo = partyMatch[3] ? Number(partyMatch[3]) : null;

    if (!isValidPartyMemberCount(memberCount)) return null;
    if (recruitNo !== null && !isValidRecruitNo(recruitNo)) return null;
    if (isRiftParty && memberCount !== 5) return null;

    if (isRiftParty) {
      return {
        recruitNo,
        type: "PARTY_RIFT",
        title: "5인 협곡 파티 구인",
        maxMembers: 5,
        template: buildLinePartyTemplate("5인 협곡 파티 구인", recruitNo),
      };
    }

    return {
      recruitNo,
      type: "PARTY_NUMBER",
      title: `${memberCount}인 파티 구인`,
      maxMembers: memberCount,
      template: buildNumberPartyTemplate(
        `${memberCount}인 파티 구인`,
        recruitNo,
        memberCount,
      ),
    };
  }

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
        "》시작시간 :",
        "》게임정보 :",
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
        ["》시작시간 :", "》게임정보 :"],
        true,
      ),
    };
  }

  if (command === "롤체일반구인") {
    return {
      recruitNo,
      type: "TFT_NORMAL",
      title: "롤체 일반 하실분!",
      maxMembers: 8,
      template: buildNumberTemplate("롤체 일반", recruitNo, 8, [
        "》시작시간 :",
        "》게임정보 :",
      ]),
    };
  }

  if (command === "롤체랭크구인") {
    return {
      recruitNo,
      type: "TFT_RANK",
      title: "롤체 랭크 하실분!",
      maxMembers: 3,
      template: buildNumberTemplate("롤체 랭크", recruitNo, 3, [
        "》시작시간 :",
        "》게임정보 :",
      ]),
    };
  }

  if (command === "더블업구인") {
    return {
      recruitNo,
      type: "DOUBLE_UP",
      title: "더블업 하실분!",
      maxMembers: 2,
      template: buildNumberTemplate("더블업", recruitNo, 2, [
        "》시작시간 :",
        "》게임정보 :",
      ]),
    };
  }

  return {
    recruitNo,
    type: "OTHER_GAME",
    title: "기타게임 하실분!",
    maxMembers: 8,
    template: buildNumberTemplate("기타게임", recruitNo, 8, [
      "》시작시간 :",
      "》게임정보 :",
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
    "》시작시간 :",
    "》게임정보 :",
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

function buildLinePartyTemplate(title: string, recruitNo: number | null) {
  return [
    `📢 ${title}`,
    formatRecruitNoLine(recruitNo),
    "",
    "》시작시간 :",
    "》게임정보 :",
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

function buildNumberPartyTemplate(
  title: string,
  recruitNo: number | null,
  maxMembers: number,
) {
  const lines = [
    `📢 ${title}`,
    formatRecruitNoLine(recruitNo),
    "",
    "》시작시간 :",
    "》게임정보 :",
    "",
  ];
  for (let slotNo = 1; slotNo <= maxMembers; slotNo += 1) {
    lines.push(`${slotNo}.`);
  }
  lines.push(
    "",
    "참여해주실 분은 태그해주세요.",
    "*상호배려와 존중 부탁드립니다.",
  );
  return lines.join("\n");
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
  const commandMatch = text.match(
    /^\/?구인(?:마감|쫑|종료)\s*#?\s*(\d{1,2})\s*$/,
  );
  const match = shortMatch || commandMatch;

  if (!match) return null;

  const recruitNo = Number(match[1]);
  if (!isValidRecruitNo(recruitNo)) return null;
  return { recruitNo };
}

export function extractRecruitNoFromForm(message: string) {
  const text = normalizeText(message);
  const explicit = text.match(/모집번호\s*[:：]?\s*#?\s*(\d{1,2})/);
  const compact = text.match(/(^|\s)#\s*(\d{1,2})(?=\s|·|$)/);
  const value = explicit
    ? Number(explicit[1])
    : compact
      ? Number(compact[2])
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
    note: meta.note,
    members: isLinePartyType(partyType)
      ? parseLineMembers(text)
      : parseNumberMembers(text, maxMembers),
  };
}

function cleanGuideValue(line: string, labelPattern: RegExp) {
  return line
    .replace(/[》>]/g, "")
    .replace(labelPattern, "")
    .replace(/^\s*[:：]\s*/, "")
    .trim();
}

function parseStartTimeAndTier(value: string) {
  let cleaned = value.replace(/\+\s*티어/g, "").trim();
  let tierText: string | null = null;

  for (const tier of TIER_WORDS) {
    const escaped = tier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = cleaned.match(
      new RegExp(`(?:^|\\s)(${escaped})(?:\\s*)$`, "i"),
    );
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
  let note: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.indexOf("게임 시작 시간") >= 0) {
      const value = cleanGuideValue(line, /게임\s*시작\s*시간/g);
      const parsed = parseStartTimeAndTier(value);
      startTimeText = parsed.startTimeText ?? startTimeText;
      tierText = parsed.tierText ?? tierText;
      continue;
    }

    if (
      line.indexOf("시작시간") >= 0 ||
      line.indexOf("시작 시간") >= 0 ||
      line.indexOf("출발시간") >= 0 ||
      line.indexOf("출발 시간") >= 0
    ) {
      const value = cleanGuideValue(line, /(시작|출발)\s*시간/g);
      startTimeText = value || startTimeText;
      continue;
    }

    if (line.indexOf("게임정보") >= 0 || line.indexOf("게임 정보") >= 0) {
      const value = cleanGuideValue(line, /게임\s*정보/g);
      note = value || note;
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
    note,
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
  void maxMembers;
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

    if (/^#\s*\d{1,2}\s*·/.test(line)) continue;
    if (/^\d{1,3}\s*인\s*/.test(line)) continue;
    if (/^현재\s*인원\s*[:：]/.test(line)) continue;
    if (/^모집번호\s*[:：]/.test(line)) continue;
    if (/^(시작|출발)\s*시간\s*[:：]/.test(line)) continue;
    if (/^기준\s*[:：]?/.test(line)) continue;
    if (/^현황\s*보기\s*[:：]?/.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    if (/^[-]{5,}$/.test(line)) continue;

    const match = line.match(/^(\d{1,3})(?:[.)]|\s+)\s*(.*)$/);
    if (!match) continue;

    const slotNo = Number(match[1]);
    if (!Number.isInteger(slotNo) || slotNo < 1 || slotNo > 99) continue;

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
  const titleLabel = getCompactRecruitTitleLabel(party);
  const activeCount = getActiveMemberCount(party.members);
  const displayActiveCount = Math.min(activeCount, party.maxMembers);
  const subMembers = party.members.filter((member) => member.isSubstitute);
  const lines: string[] = [];

  lines.push(
    `#${party.recruitNo} · ${titleLabel} · ${displayActiveCount}/${party.maxMembers}`,
  );
  lines.push(`시작시간: ${formatStartTimeText(party.startTimeText)}`);
  lines.push(`》게임정보 : ${formatGameInfoText(buildGameInfoText(party))}`);
  if (subMembers.length > 0) lines.push(`예비: ${subMembers.length}명`);
  lines.push("");

  if (isLinePartyType(String(party.type))) {
    for (const position of LINE_POSITIONS) {
      const member = party.members.find((item) => item.position === position);
      lines.push(`${position}.${member?.name ? ` ${member.name}` : ""}`);
    }
  } else {
    const maxWrittenSlotNo = Math.max(
      party.maxMembers,
      ...party.members
        .filter((item) => !item.isSubstitute && typeof item.slotNo === "number")
        .map((item) => Number(item.slotNo)),
    );

    for (let slotNo = 1; slotNo <= maxWrittenSlotNo; slotNo += 1) {
      const member = party.members.find(
        (item) => !item.isSubstitute && item.slotNo === slotNo,
      );
      lines.push(`${slotNo}.${member?.name ? ` ${member.name}` : ""}`);
    }
    if (String(party.type) === "ARAM" || subMembers.length > 0) {
      lines.push(
        `예비.${subMembers.length > 0 ? ` ${subMembers.map((item) => item.name).join(", ")}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

function getCompactRecruitTitleLabel(party: RecruitPartyLike) {
  const title = String(party.title || getRecruitTypeLabel(String(party.type)))
    .replace(/!+$/g, "")
    .replace(/\s*구인\s*$/g, "")
    .replace(/\s*하실분\s*$/g, "")
    .trim();

  return title || `${party.maxMembers}인 파티`;
}

function formatStartTimeText(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "미정";
  if (isImmediateStartText(text)) return "바로 시작";

  return text
    .replace(/(\d{1,2})\s*시\s*(\d{1,2})\s*분/g, (_match, hour, minute) => {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    })
    .replace(/(\d{1,2})\s*시(?!\s*간)/g, (_match, hour) => {
      return `${String(hour).padStart(2, "0")}:00`;
    })
    .replace(/(^|\D)0(\d):/g, "$1$2:");
}

function formatGameInfoText(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "미입력";

  return text
    .replace(/수준\s*예상/g, "예상")
    .replace(
      /(구합니다|구함|구해요)\s+((?:아이언|브론즈|실버|골드|플래티넘|플래|플레|에메랄드|에메|다이아몬드|다이아|마스터|그랜드마스터|그마|챌린저)[^\n]*)/g,
      "$1 / $2",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildGameInfoText(
  party: Pick<
    RecruitPartyLike,
    "note" | "startTimeText" | "tierText" | "playStyle" | "preferredLineText"
  >,
) {
  if (party.note && party.note.trim()) return party.note.trim();

  const legacyParts = [
    party.tierText,
    party.playStyle,
    party.preferredLineText ? `${party.preferredLineText} 선호` : null,
  ].filter(Boolean);

  return legacyParts.join(" / ").trim() || null;
}

function sortRecruitPartiesForStatus(parties: RecruitPartyLike[]) {
  return [...parties].sort((a, b) => {
    const groupDiff =
      getRecruitGroupOrder(getRecruitDisplayGroup(a)) -
      getRecruitGroupOrder(getRecruitDisplayGroup(b));
    if (groupDiff !== 0) return groupDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function groupRecruitParties(parties: RecruitPartyLike[]) {
  const grouped: Record<RecruitDisplayGroup, RecruitPartyLike[]> = {
    RECRUITING: [],
    WAITING: [],
    PLAYING: [],
    LARGE: [],
  };

  for (const party of sortRecruitPartiesForStatus(parties)) {
    grouped[getRecruitDisplayGroup(party)].push(party);
  }

  return grouped;
}

function formatRecruitMemberSummary(party: RecruitPartyLike) {
  const activeNames = party.members
    .filter((member) => !member.isSubstitute && member.name.trim() !== "")
    .sort((a, b) => Number(a.slotNo ?? 999) - Number(b.slotNo ?? 999))
    .map((member) => member.name.trim());

  if (activeNames.length === 0) return "참여: 없음";

  if (party.maxMembers <= 5 || activeNames.length <= 5) {
    return `참여: ${activeNames.join(", ")}`;
  }

  return `참여: ${activeNames.slice(0, 5).join(", ")} 외 ${activeNames.length - 5}명`;
}

function formatRecruitPartySummaryLine(party: RecruitPartyLike) {
  const activeCount = getDisplayActiveMemberCount(
    party.members,
    party.maxMembers,
  );
  const titleLabel = getCompactRecruitTitleLabel(party);
  const info = formatGameInfoText(buildGameInfoText(party));
  const startTime = formatStartTimeText(party.startTimeText);

  return [
    `#${party.recruitNo} · ${titleLabel} · ${activeCount}/${party.maxMembers} · ${startTime} · ${info}`,
    formatRecruitMemberSummary(party),
  ].join("\n");
}

export function buildRecruitStatusReply(
  parties: RecruitPartyLike[],
  options?: { detailRecruitNo?: number | null; detailThreshold?: number },
) {
  const activeParties = filterRecruitingParties(parties);
  const detailRecruitNo = options?.detailRecruitNo ?? null;
  const detailThreshold = options?.detailThreshold ?? 5;

  if (activeParties.length === 0) {
    return [
      "[K-LOL.GG 구인구직 현황]",
      "",
      "현재 진행 중인 구인글이 없습니다.",
    ].join("\n");
  }

  if (detailRecruitNo !== null) {
    const target = activeParties.find(
      (party) => party.recruitNo === detailRecruitNo,
    );
    if (!target) {
      return [
        "[K-LOL.GG 구인상세]",
        "",
        `모집번호 #${detailRecruitNo} 구인글을 찾지 못했습니다.`,
      ].join("\n");
    }

    return ["[K-LOL.GG 구인상세]", "", formatRecruitPartyBlock(target)].join(
      "\n",
    );
  }

  const grouped = groupRecruitParties(activeParties);
  const orderedGroups: RecruitDisplayGroup[] = [
    "RECRUITING",
    "WAITING",
    "PLAYING",
    "LARGE",
  ];
  const lines = ["[K-LOL.GG 구인구직 현황]", ""];

  if (activeParties.length > detailThreshold) {
    for (const group of orderedGroups) {
      const items = grouped[group];
      if (items.length === 0) continue;
      lines.push(getRecruitGroupTitle(group));
      for (const party of items)
        lines.push(formatRecruitPartySummaryLine(party));
      lines.push("");
    }

    lines.push("상세보기: 구인상세 번호");
    return lines.join("\n").trimEnd();
  }

  const detailLines: string[] = ["[K-LOL.GG 구인구직 현황]", ""];
  let printedPartyCount = 0;

  for (const group of orderedGroups) {
    const items = grouped[group];
    if (items.length === 0) continue;

    if (printedPartyCount > 0) {
      detailLines.push("------------------------------------");
      detailLines.push("");
    }

    detailLines.push(getRecruitGroupTitle(group));
    detailLines.push("");

    items.forEach((party, index) => {
      if (index > 0) {
        detailLines.push("");
        detailLines.push("------------------------------------");
        detailLines.push("");
      }
      detailLines.push(formatRecruitPartyBlock(party));
      printedPartyCount += 1;
    });

    detailLines.push("");
  }

  return detailLines.join("\n").trimEnd();
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
    return "[K-LOL.GG 구인구직 등록 완료]";
  }

  if (
    typeof previousActiveCount === "number" &&
    activeCount < previousActiveCount
  ) {
    return "[K-LOL.GG 구인구직 수정 완료]";
  }

  return "[K-LOL.GG 구인구직 수정 완료]";
}

export function buildCreateReply(template: string, recruitNo?: number) {
  const fixedTemplate =
    typeof recruitNo === "number"
      ? template.replace("모집번호: #자동생성", `모집번호: #${recruitNo}`)
      : template;
  return [
    "[K-LOL.GG 구인구직 양식]",
    "같이 할사람~",
    "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.",
    "",
    fixedTemplate,
  ].join("\n");
}
