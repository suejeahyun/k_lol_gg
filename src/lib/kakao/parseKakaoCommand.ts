export type KakaoOpenchatCommandType = "record" | "recent" | "ranking" | "help" | "status" | "unknown";

export type ParsedKakaoOpenchatCommand = {
  type: KakaoOpenchatCommandType;
  rawMessage: string;
  query: string | null;
};

const COMMAND_ALIASES: Record<string, KakaoOpenchatCommandType> = {
  "전적": "record",
  "!전적": "record",
  "/전적": "record",
  "record": "record",
  "!record": "record",
  "/record": "record",

  "최근": "recent",
  "!최근": "recent",
  "/최근": "recent",
  "recent": "recent",
  "!recent": "recent",
  "/recent": "recent",

  "랭킹": "ranking",
  "!랭킹": "ranking",
  "/랭킹": "ranking",
  "ranking": "ranking",
  "rank": "ranking",
  "!ranking": "ranking",
  "/ranking": "ranking",
  "!rank": "ranking",
  "/rank": "ranking",

  "내전현황": "status",
  "시즌내전현황": "status",

  "도움말": "help",
  "!도움말": "help",
  "/도움말": "help",
  "구인도움말": "help",
  "!구인도움말": "help",
  "/구인도움말": "help",
  "명령어": "help",
  "!명령어": "help",
  "/명령어": "help",
  "help": "help",
  "!help": "help",
  "/help": "help",

  "status": "status",
  "!status": "status",
  "/status": "status",
};

export function parseKakaoCommand(message: unknown): ParsedKakaoOpenchatCommand {
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
    '[K-LOL.GG 통합 카카오봇 도움말]',
    '',
    'LOL-K 기능',
    '- 내전현황 : 현재 시즌내전 신청 현황',
    '- AI공지 : 내전현황과 동일하게 처리',
    '- 내전참가 / 참가신청 : 참가 방법 안내',
    '- 전적 닉네임#태그 : 플레이어 전적 조회',
    '- 최근 닉네임#태그 : 최근 경기 조회',
    '- 랭킹 : 랭킹 조회',
    '',
    '구인구직 파티 생성',
    '- 2인파티',
    '- 3인파티',
    '- 4인파티',
    '- 5인파티',
    '- 8인파티',
    '- 10인파티',
    '',
    '인원수에 따른 양식 생성 후 게임정보란에 게임 종류, 시작시간 등을 작성',
    '',
    '구인구직 기능',
    '- 구인도우미 : 명령어 전체 설명 페이지',
    '- 구인현황 / 현황',
    '- 모집번호 + 쫑 or 모집번호 + ㅉ',
    '- 구인마감 #번호',
    '- 구인도움말',
    '',
    '내전 구인구직방 기능',
    '- 내전구인',
    '- 내전구인구직',
    '',
    '참고',
    '- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.',
    '- 예) /5인협곡파티, /구인현황, /도움말',
  ].join("\n");
}
