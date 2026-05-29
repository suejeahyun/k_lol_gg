export type KakaoOpenchatCommandType =
  | "record"
  | "recent"
  | "ranking"
  | "help"
  | "recruitHelp"
  | "status"
  | "unknown";

export type ParsedKakaoOpenchatCommand = {
  type: KakaoOpenchatCommandType;
  rawMessage: string;
  query: string | null;
};

const COMMAND_ALIASES: Record<string, KakaoOpenchatCommandType> = {
  전적: "record",
  "!전적": "record",
  "/전적": "record",
  record: "record",
  "!record": "record",
  "/record": "record",

  최근: "recent",
  "!최근": "recent",
  "/최근": "recent",
  recent: "recent",
  "!recent": "recent",
  "/recent": "recent",

  랭킹: "ranking",
  "!랭킹": "ranking",
  "/랭킹": "ranking",
  ranking: "ranking",
  rank: "ranking",
  "!ranking": "ranking",
  "/ranking": "ranking",
  "!rank": "ranking",
  "/rank": "ranking",

  내전현황: "status",
  시즌내전현황: "status",

  도움말: "help",
  "!도움말": "help",
  "/도움말": "help",
  구인도움말: "recruitHelp",
  "!구인도움말": "recruitHelp",
  "/구인도움말": "recruitHelp",
  구인구직도움말: "recruitHelp",
  "!구인구직도움말": "recruitHelp",
  "/구인구직도움말": "recruitHelp",
  구인명령어: "recruitHelp",
  "!구인명령어": "recruitHelp",
  "/구인명령어": "recruitHelp",
  명령어: "help",
  "!명령어": "help",
  "/명령어": "help",
  help: "help",
  "!help": "help",
  "/help": "help",

  status: "status",
  "!status": "status",
  "/status": "status",
};

export function parseKakaoCommand(
  message: unknown,
): ParsedKakaoOpenchatCommand {
  const rawMessage = typeof message === "string" ? message.trim() : "";

  if (!rawMessage) {
    return {
      type: "unknown",
      rawMessage: "",
      query: null,
    };
  }

  const [command = "", ...rest] = rawMessage.split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  const type = COMMAND_ALIASES[normalizedCommand] ?? "unknown";
  const query = rest.join(" ").trim() || null;

  return {
    type,
    rawMessage,
    query,
  };
}

export function getKakaoHelpMessage() {
  return [
    "[K-LOL.GG 일반 도움말]",
    "",
    "LOL-K 기능",
    "- 내전현황 : 현재 시즌내전 신청 현황",
    "- AI공지 : 내전현황과 동일하게 처리",
    "- 내전참가 / 참가신청 : 참가 방법 안내",
    "- 전적 닉네임#태그 : 플레이어 전적 조회",
    "- 최근 닉네임#태그 : 최근 경기 조회",
    "- 랭킹 : 랭킹 조회",
    "",
    "구인구직 명령어는 구인도움말을 입력해주세요.",
    "",
    "참고",
    "- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.",
    "- 예) /내전현황, /전적 닉네임#태그, /구인도움말",
  ].join("\n");
}

export function getKakaoRecruitHelpMessage() {
  return [
    "[K-LOL.GG 구인구직 도움말]",
    "",
    "구인 전에는 /구인현황 을 먼저 확인해주세요.",
    "",
    "[파티 만들기]",
    "/숫자인파티",
    "예) /2인파티, /5인파티, /8인파티, /10인파티",
    "",
    "[파티 참여]",
    "1. /구인현황 확인",
    "2. 참여할 파티 양식 복사",
    "3. 빈자리에 이름 추가",
    "4. 수정한 양식 전송",
    "",
    "[파티 제외]",
    "1. /구인현황 확인",
    "2. 내 이름이 있는 양식 복사",
    "3. 내 이름 삭제",
    "4. 수정한 양식 전송",
    "",
    "[파티 마감]",
    "번호ㅉ",
    "예) 13ㅉ",
    "",
    "[상세 보기]",
    "구인상세 번호",
    "예) 구인상세 13",
    "",
    "[내전]",
    "/내전구인 : 내전 양식 불러오기",
    "/내전현황 : 내전 현황 보기",
  ].join("\n");
}
