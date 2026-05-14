export type KakaoOpenchatCommandType = "record" | "recent" | "ranking" | "help" | "unknown";

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

  "도움말": "help",
  "!도움말": "help",
  "/도움말": "help",
  "명령어": "help",
  "!명령어": "help",
  "/명령어": "help",
  "help": "help",
  "!help": "help",
  "/help": "help",
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
    "📌 K-LOL.GG 명령어",
    "",
    "전적 닉네임#태그",
    "최근 닉네임#태그",
    "랭킹",
    "도움말",
    "내전참가",
    "",
    "예시: 전적 sax0ph0ne#99단굵묵",
  ].join("\n");
}
