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
    "[K-LOL.GG 카카오 명령어]",
    "",
    "LOL - K방",
    "전적 닉네임#태그",
    "최근 닉네임#태그",
    "랭킹",
    "내전현황",
    "내전참가",
    "",
    "구인구직방",
    "자랭구인 또는 /자랭구인",
    "일반구인 또는 /일반구인",
    "솔랭구인 또는 /솔랭구인",
    "칼바람구인 또는 /칼바람구인",
    "증바람구인 또는 /증바람구인",
    "롤체일반구인 또는 /롤체일반구인",
    "롤체랭크구인 또는 /롤체랭크구인",
    "더블업구인 또는 /더블업구인",
    "구인현황 또는 /구인현황",
    "12 쫑 또는 /12 쫑",
    "구인마감 #번호 또는 /구인마감 #번호",
    "",
    "예시: 전적 sax0ph0ne#99단굵묵",
  ].join("\n");
}
