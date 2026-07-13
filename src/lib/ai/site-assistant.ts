import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export type SiteAiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SiteAiScope =
  | "general"
  | "admin"
  | "player"
  | "match"
  | "balance"
  | "destruction"
  | "recruit";

export type SiteAiPageContextInput = {
  pathname?: string;
  search?: string;
  title?: string;
};

type SiteAiUser = {
  userAccountId: number | string;
  userId: string;
  role: string;
  playerId: number | null;
};

type SiteAiAudience = "admin" | "user";

type SiteAiContext = {
  generatedAt: string;
  audience: SiteAiAudience;
  assistantName: string;
  season: string;
  page: {
    pathname: string;
    search: string;
    summary: string;
    links: string[];
  } | null;
  requester: {
    userId: string;
    role: string;
    playerSummary: string | null;
  };
  counts: {
    players: number;
    matches: number;
    activeRecruits: number;
    destructionTournaments: number;
  };
  topPlayers: string[];
  recentMatches: string[];
  recruits: string[];
  destruction: string[];
};

type RunSiteAiAssistantInput = {
  message: string;
  history?: SiteAiChatMessage[];
  scope?: SiteAiScope;
  page?: SiteAiPageContextInput;
  user: SiteAiUser;
};

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 6;
const DEFAULT_MODEL = "gpt-4.1-mini";

function isAdminRole(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function clip(value: unknown, max = 700) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function winRate(wins: number, totalGames: number) {
  if (!totalGames) return "0%";
  return `${Math.round((wins / totalGames) * 1000) / 10}%`;
}

function getFirstIdFromPath(pathname: string, pattern: RegExp) {
  const match = pathname.match(pattern);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function collectPageContext(
  page: SiteAiPageContextInput | undefined,
  user: SiteAiUser,
): Promise<SiteAiContext["page"]> {
  const pathname = String(page?.pathname ?? "").trim();
  if (!pathname) return null;
  const isAdmin = isAdminRole(user.role);

  if (!isAdmin && pathname.startsWith("/admin")) {
    return {
      pathname: "/",
      search: "",
      links: ["/"],
      summary: "일반 유저 요청이므로 관리자 페이지 컨텍스트는 제공하지 않습니다.",
    };
  }

  const safeSearch = String(page?.search ?? "").slice(0, 300);
  const links = [pathname];

  const playerId = getFirstIdFromPath(pathname, /^\/(?:admin\/)?players\/(\d+)(?:\/|$)/);
  if (playerId) {
    const player = await prisma.player
      .findUnique({
        where: { id: playerId },
        select: {
          id: true,
          name: true,
          nickname: true,
          tag: true,
          currentTier: true,
          peakTier: true,
          seasonStats: {
            orderBy: { seasonId: "desc" },
            take: 1,
            select: {
              totalGames: true,
              participationCount: true,
              wins: true,
              losses: true,
              mvpCount: true,
              season: { select: { name: true } },
            },
          },
        },
      })
      .catch(() => null);

    if (player) {
      const stat = player.seasonStats[0];
      return {
        pathname,
        search: safeSearch,
        links,
        summary: stat
          ? `현재 페이지는 플레이어 ${player.name}(${player.nickname}#${player.tag}) 상세입니다. 현재 티어 ${player.currentTier ?? "없음"}, 최고 티어 ${player.peakTier ?? "없음"}, ${stat.season.name} 기준 참가 ${stat.participationCount}, ${stat.wins}승 ${stat.losses}패, 승률 ${winRate(stat.wins, stat.totalGames)}, MVP ${stat.mvpCount}.`
          : `현재 페이지는 플레이어 ${player.name}(${player.nickname}#${player.tag}) 상세입니다. 시즌 통계는 아직 없습니다.`,
      };
    }
  }

  const matchId = getFirstIdFromPath(pathname, /^\/(?:admin\/)?matches\/(\d+)(?:\/|$)/);
  if (matchId) {
    const match = await prisma.matchSeries
      .findUnique({
        where: { id: matchId },
        select: {
          id: true,
          title: true,
          matchDate: true,
          season: { select: { name: true } },
          games: {
            select: {
              winnerTeam: true,
              durationMin: true,
              mvpScore: true,
              participants: {
                select: {
                  team: true,
                  position: true,
                  kills: true,
                  deaths: true,
                  assists: true,
                  player: { select: { name: true } },
                  champion: { select: { name: true } },
                },
              },
            },
          },
        },
      })
      .catch(() => null);

    if (match) {
      const blueWins = match.games.filter((game) => game.winnerTeam === "BLUE").length;
      const redWins = match.games.filter((game) => game.winnerTeam === "RED").length;
      const avgDuration = match.games.length
        ? Math.round(match.games.reduce((sum, game) => sum + game.durationMin, 0) / match.games.length)
        : 0;
      const mvpCount = match.games.filter((game) => game.mvpScore != null).length;
      return {
        pathname,
        search: safeSearch,
        links,
        summary: `현재 페이지는 내전 ${match.title} 상세입니다. ${match.season.name}, ${formatDate(match.matchDate)}, ${match.games.length}세트, BLUE ${blueWins}: RED ${redWins}, 평균 ${avgDuration}분, MVP 기록 ${mvpCount}세트.`,
      };
    }
  }

  const destructionId = getFirstIdFromPath(
    pathname,
    /^\/(?:admin\/)?(?:progress\/)?destruction(?:-auction-live)?\/(\d+)(?:\/|$)/,
  ) ?? getFirstIdFromPath(pathname, /^\/admin\/progress\/destruction\/(\d+)(?:\/|$)/);
  if (destructionId) {
    const tournament = await prisma.destructionTournament
      .findUnique({
        where: { id: destructionId },
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          endDate: true,
          teams: { select: { id: true, name: true, points: true, wins: true, losses: true } },
          participants: {
            select: {
              auctionStatus: true,
              isCaptain: true,
              purchasePoint: true,
              player: { select: { name: true } },
            },
          },
          matches: { select: { id: true, isConfirmed: true } },
        },
      })
      .catch(() => null);

    if (tournament) {
      const pendingAuction = tournament.participants.filter((item) => item.auctionStatus === "PENDING").length;
      const soldAuction = tournament.participants.filter((item) => item.auctionStatus === "SOLD").length;
      const confirmedMatches = tournament.matches.filter((match) => match.isConfirmed).length;
      return {
        pathname,
        search: safeSearch,
        links,
        summary: `현재 페이지는 멸망전 ${tournament.title} 상세입니다. 상태 ${tournament.status}, 팀 ${tournament.teams.length}, 참가자 ${tournament.participants.length}, 주장 ${tournament.participants.filter((item) => item.isCaptain).length}, 경매 낙찰 ${soldAuction}, 경매 대기 ${pendingAuction}, 확정 경기 ${confirmedMatches}/${tournament.matches.length}.`,
      };
    }
  }

  return {
    pathname,
    search: safeSearch,
    links,
    summary: `현재 페이지는 ${page?.title ? `${page.title} ` : ""}${pathname}${safeSearch ? `?${safeSearch}` : ""} 입니다. 이 라우트에 대한 상세 DB 컨텍스트는 아직 별도 수집 대상이 아닙니다.`,
  };
}

async function collectRequesterSummary(user: SiteAiUser) {
  if (!user.playerId) return null;

  const player = await prisma.player
    .findUnique({
      where: { id: user.playerId },
      select: {
        name: true,
        nickname: true,
        tag: true,
        currentTier: true,
        peakTier: true,
        seasonStats: {
          orderBy: { seasonId: "desc" },
          take: 1,
          select: {
            totalGames: true,
            participationCount: true,
            wins: true,
            losses: true,
            mvpCount: true,
            season: { select: { name: true } },
          },
        },
      },
    })
    .catch(() => null);

  if (!player) return null;
  const stat = player.seasonStats[0];

  if (!stat) {
    return `${player.name}(${player.nickname}#${player.tag}) / 현재 ${player.currentTier ?? "티어 없음"} / 최고 ${player.peakTier ?? "티어 없음"} / 시즌 통계 없음`;
  }

  return `${player.name}(${player.nickname}#${player.tag}) / 현재 ${player.currentTier ?? "티어 없음"} / 최고 ${player.peakTier ?? "티어 없음"} / ${stat.season.name} 참가 ${stat.participationCount}, ${stat.wins}승 ${stat.losses}패, 승률 ${winRate(stat.wins, stat.totalGames)}, MVP ${stat.mvpCount}`;
}

async function collectSiteAiContext(input: RunSiteAiAssistantInput): Promise<SiteAiContext> {
  const isAdmin = isAdminRole(input.user.role);
  const audience: SiteAiAudience = isAdmin ? "admin" : "user";
  const activeSeason = await prisma.season
    .findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
      select: { id: true, name: true },
    })
    .catch(() => null);

  const seasonId = activeSeason?.id;

  const [
    playerCount,
    matchCount,
    activeRecruitCount,
    destructionCount,
    topStats,
    recentMatches,
    recruitParties,
    destructionTournaments,
    pageContext,
    requesterSummary,
  ] = await Promise.all([
    prisma.player.count({ where: { isActive: true } }).catch(() => 0),
    prisma.matchSeries.count().catch(() => 0),
    isAdmin ? prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0) : Promise.resolve(0),
    prisma.destructionTournament.count().catch(() => 0),
    seasonId
      ? prisma.playerSeasonStat
          .findMany({
            where: { seasonId, totalGames: { gt: 0 } },
            orderBy: [{ wins: "desc" }, { mvpCount: "desc" }, { totalGames: "desc" }],
            take: 5,
            select: {
              totalGames: true,
              participationCount: true,
              wins: true,
              losses: true,
              mvpCount: true,
              player: {
                select: {
                  name: true,
                  nickname: true,
                  tag: true,
                  currentTier: true,
                },
              },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.matchSeries
      .findMany({
        orderBy: { matchDate: "desc" },
        take: 5,
        select: {
          title: true,
          matchDate: true,
          season: { select: { name: true } },
          games: {
            select: {
              winnerTeam: true,
              durationMin: true,
            },
          },
        },
      })
      .catch(() => []),
    isAdmin
      ? prisma.recruitParty
          .findMany({
            where: { status: "IN_PROGRESS" },
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: {
              recruitNo: true,
              title: true,
              hostName: true,
              status: true,
              type: true,
              maxMembers: true,
              members: { select: { id: true } },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.destructionTournament
      .findMany({
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          teams: { select: { id: true } },
          participants: { select: { id: true, auctionStatus: true } },
        },
      })
      .catch(() => []),
    collectPageContext(input.page, input.user),
    collectRequesterSummary(input.user),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    audience,
    assistantName: isAdmin ? "AI 운영 비서" : "K-LOL 코치",
    season: activeSeason?.name ?? "활성 시즌 없음",
    page: pageContext,
    requester: {
      userId: input.user.userId,
      role: input.user.role,
      playerSummary: requesterSummary,
    },
    counts: {
      players: playerCount,
      matches: matchCount,
      activeRecruits: activeRecruitCount,
      destructionTournaments: destructionCount,
    },
    topPlayers: topStats.map((stat, index) => {
      const player = stat.player;
      return `${index + 1}. ${player.name}(${player.nickname}#${player.tag}) ${player.currentTier ?? "티어 없음"} ${stat.wins}승 ${stat.losses}패, 승률 ${winRate(stat.wins, stat.totalGames)}, MVP ${stat.mvpCount}, 참가 ${stat.participationCount}`;
    }),
    recentMatches: recentMatches.map((match) => {
      const blueWins = match.games.filter((game) => game.winnerTeam === "BLUE").length;
      const redWins = match.games.filter((game) => game.winnerTeam === "RED").length;
      const avgDuration = match.games.length
        ? Math.round(match.games.reduce((sum, game) => sum + game.durationMin, 0) / match.games.length)
        : 0;
      return `${match.title} / ${match.season.name} / ${formatDate(match.matchDate)} / ${match.games.length}세트 / BLUE ${blueWins}: RED ${redWins} / 평균 ${avgDuration}분`;
    }),
    recruits: recruitParties.map((party) => {
      return `#${party.recruitNo} ${party.title} / ${party.status} / ${party.type} / ${party.hostName ?? "호스트 없음"} / ${party.members.length}/${party.maxMembers}`;
    }),
    destruction: destructionTournaments.map((tournament) => {
      const pendingAuction = tournament.participants.filter((item) => item.auctionStatus === "PENDING").length;
      return `#${tournament.id} ${tournament.title} / ${tournament.status} / ${formatDate(tournament.startDate)} / 팀 ${tournament.teams.length} / 참가자 ${tournament.participants.length} / 경매대기 ${pendingAuction}`;
    }),
  };
}

function buildContextText(context: SiteAiContext) {
  const isAdmin = context.audience === "admin";
  return [
    `생성시각: ${context.generatedAt}`,
    `비서 모드: ${context.assistantName} (${context.audience})`,
    `현재 시즌: ${context.season}`,
    isAdmin
      ? `주요 수치: 활성 플레이어 ${context.counts.players}, 내전 ${context.counts.matches}, 진행중 구인 ${context.counts.activeRecruits}, 멸망전 ${context.counts.destructionTournaments}`
      : `공개 주요 수치: 활성 플레이어 ${context.counts.players}, 내전 ${context.counts.matches}, 멸망전 ${context.counts.destructionTournaments}`,
    `요청자 정보: ${context.requester.playerSummary ?? "연결된 플레이어 정보 없음"}`,
    `현재 페이지: ${context.page ? context.page.summary : "페이지 정보 없음"}`,
    `상위 플레이어: ${context.topPlayers.length ? context.topPlayers.join(" | ") : "데이터 없음"}`,
    `최근 내전: ${context.recentMatches.length ? context.recentMatches.join(" | ") : "데이터 없음"}`,
    isAdmin
      ? `구인 현황: ${context.recruits.length ? context.recruits.join(" | ") : "데이터 없음"}`
      : "구인/카카오 운영 현황: 일반 유저에게 제공하지 않음",
    `멸망전: ${context.destruction.length ? context.destruction.join(" | ") : "데이터 없음"}`,
  ].join("\n");
}

function buildPrompt(input: RunSiteAiAssistantInput, context: SiteAiContext) {
  const safeMessage = clip(input.message, MAX_MESSAGE_LENGTH);
  const safeHistory = (input.history ?? [])
    .slice(-MAX_HISTORY_ITEMS)
    .map((message) => `${message.role === "user" ? "사용자" : "AI"}: ${clip(message.content, 500)}`)
    .join("\n");
  const roleRules = context.audience === "admin"
    ? [
        "너는 K-LOL.GG 관리자용 AI 운영 비서다.",
        "목표: 카카오톡 오픈채팅 기반 LoL 내전 운영자가 빠르게 판단하고 다음 행동을 정하도록 돕는다.",
        "관리자는 구인, 카카오 운영, 팀 밸런스, 멸망전, 로그, 사이트 설정에 대한 운영 질문을 할 수 있다.",
      ]
    : [
        "너는 일반 유저용 K-LOL 코치다.",
        "목표: 유저가 공개 랭킹, 본인 플레이어 정보, 내전 기록, 멸망전 공개 진행 정보를 쉽게 이해하도록 돕는다.",
        "일반 유저에게 관리자 전용 정보, 구인/카카오 운영 내부 상태, 경고/징계, 로그, 결제, 사이트 설정, env, 토큰, API 키, 다른 유저의 비공개 정보를 절대 제공하지 않는다.",
        "운영자만 볼 수 있는 내용을 물으면 권한상 도와줄 수 없다고 짧게 말하고, 공개 페이지에서 확인 가능한 대체 질문을 제안한다.",
      ];

  return [
    ...roleRules,
    "원칙:",
    "- DB 컨텍스트에 없는 사실은 추측하지 말고, 필요한 확인 항목을 말한다.",
    "- 민감정보, 토큰, 비밀번호, 내부 env, 숨겨진 추론 과정은 절대 말하지 않는다.",
    "- 결과는 한국어로 짧고 실무적으로 작성한다.",
    "- 가능한 경우 '요약 / 판단 / 추천 행동 / 확인 필요' 순서로 답한다.",
    `요청 범위: ${input.scope ?? "general"}`,
    `요청자: ${input.user.userId} (${input.user.role})`,
    "현재 운영 데이터:",
    buildContextText(context),
    safeHistory ? `최근 대화:\n${safeHistory}` : "최근 대화: 없음",
    `사용자 질문:\n${safeMessage}`,
  ].join("\n\n");
}

function fallbackAnswer(message: string, context: SiteAiContext) {
  const lower = message.toLowerCase();
  const isAdmin = context.audience === "admin";
  const focus = lower.includes("구인")
    ? "구인 현황"
    : lower.includes("멸망전") || lower.includes("경매")
      ? "멸망전"
      : lower.includes("랭킹") || lower.includes("밸런스")
        ? "랭킹/밸런스"
        : "운영 요약";

  if (!isAdmin && isAdminOnlyQuestion(message)) {
    return [
      "권한 안내: 이 질문은 관리자 운영 정보에 해당해서 일반 유저에게는 제공할 수 없습니다.",
      "대신 공개 랭킹, 내 플레이어 기록, 최근 내전, 멸망전 공개 진행 상태 기준으로 도와드릴 수 있습니다.",
    ].join("\n\n");
  }

  const recommendations = isAdmin
    ? [
        context.counts.activeRecruits > 0
          ? `진행중 구인이 ${context.counts.activeRecruits}건 있으니 마감/진행 상태를 먼저 확인하세요.`
          : "현재 진행중 구인이 없으니 신규 모집 또는 다음 내전 공지를 준비할 수 있습니다.",
        context.recentMatches.length
          ? `최근 내전은 ${context.recentMatches[0]} 입니다.`
          : "최근 내전 데이터가 없어 등록 누락 여부를 확인하세요.",
        context.destruction.length
          ? `가장 최근 멸망전 상태는 ${context.destruction[0]} 입니다.`
          : "진행중인 멸망전 데이터가 없습니다.",
      ]
    : [
        context.requester.playerSummary
          ? `내 정보 기준으로는 ${context.requester.playerSummary} 입니다.`
          : "내 플레이어가 연결되어 있지 않으면 개인 기록 분석은 제한됩니다.",
        context.recentMatches.length
          ? `최근 내전은 ${context.recentMatches[0]} 입니다.`
          : "최근 내전 데이터가 없어 공개 내전 목록을 먼저 확인하세요.",
        context.topPlayers.length
          ? `현재 상위권 흐름은 ${context.topPlayers.slice(0, 3).join(" | ")} 입니다.`
          : "랭킹 데이터가 아직 충분하지 않습니다.",
      ];

  return [
    `요약: 현재 질문은 ${isAdmin ? focus : "K-LOL 코치"} 관점으로 볼 수 있습니다.`,
    isAdmin
      ? `판단: 활성 시즌은 ${context.season}이며, 플레이어 ${context.counts.players}명 / 내전 ${context.counts.matches}건 기준입니다.`
      : `판단: 활성 시즌은 ${context.season}이며, 공개 기록과 내 플레이어 연결 정보 기준으로 답변합니다.`,
    context.page ? `현재 페이지 기준: ${context.page.summary}` : null,
    `추천 행동: ${recommendations.join(" ")}`,
    "확인 필요: OPENAI_API_KEY가 설정되면 더 정교한 문맥 판단과 운영 제안이 활성화됩니다.",
  ].filter(Boolean).join("\n\n");
}

export function isAdminOnlyQuestion(message: string) {
  const text = message.toLowerCase();
  const keywords = [
    "관리자",
    "운영 로그",
    "관리 로그",
    "사이트 설정",
    "유료",
    "결제",
    "청구",
    "경고",
    "징계",
    "강퇴",
    "ban",
    "밴",
    "벤 기록",
    "정지",
    "env",
    "토큰",
    "api key",
    "apikey",
    "비밀번호",
    "카카오 봇",
    "봇 코드",
  ];

  return keywords.some((keyword) => text.includes(keyword));
}

function extractResponseText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

async function saveAiRequestLog(params: {
  input: RunSiteAiAssistantInput;
  context: SiteAiContext;
  answer?: string;
  mode: "openai" | "fallback";
  model: string;
  status: "CONFIRMED" | "FAILED";
  errorMessage?: string;
}) {
  return prisma.operationAiRequest
    .create({
      data: {
        taskType: "SITE_AI_CHAT",
        status: params.status,
        prompt: clip(params.input.message, MAX_MESSAGE_LENGTH),
        rawText: JSON.stringify({
          scope: params.input.scope ?? "general",
          userAccountId: params.input.user.userAccountId,
          userId: params.input.user.userId,
          role: params.input.user.role,
          page: params.input.page ?? null,
        }),
        parsedJson: params.context as unknown as Prisma.InputJsonValue,
        resultJson: params.answer
          ? ({
              answer: params.answer,
              mode: params.mode,
              model: params.model,
            } as Prisma.InputJsonValue)
          : undefined,
        errorMessage: params.errorMessage,
        createdByUserId: String(params.input.user.userAccountId),
      },
    })
    .catch(() => null);
}

export async function runSiteAiAssistant(input: RunSiteAiAssistantInput) {
  const context = await collectSiteAiContext(input);
  const model = process.env.OPENAI_MODEL || process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const answer = fallbackAnswer(input.message, context);
    const requestLog = await saveAiRequestLog({
      input,
      context,
      answer,
      mode: "fallback",
      model,
      status: "CONFIRMED",
    });

    return {
      ok: true,
      answer,
      mode: "fallback" as const,
      model,
      context,
      requestId: requestLog?.id ?? null,
    };
  }

  const prompt = buildPrompt(input, context);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.2,
        max_output_tokens: 900,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message =
        typeof (data.error as { message?: unknown } | undefined)?.message === "string"
          ? String((data.error as { message: string }).message)
          : "AI 응답 생성에 실패했습니다.";
      throw new Error(message);
    }

    const answer = extractResponseText(data) || "응답을 생성했지만 표시할 텍스트가 없습니다.";
    const requestLog = await saveAiRequestLog({
      input,
      context,
      answer,
      mode: "openai",
      model,
      status: "CONFIRMED",
    });

    return {
      ok: true,
      answer,
      mode: "openai" as const,
      model,
      context,
      requestId: requestLog?.id ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 응답 생성 중 오류가 발생했습니다.";
    const answer = [
      "요약: AI 모델 호출에 실패해 DB 요약 기반 fallback으로 답변합니다.",
      fallbackAnswer(input.message, context),
    ].join("\n\n");

    const requestLog = await saveAiRequestLog({
      input,
      context,
      answer,
      mode: "fallback",
      model,
      status: "FAILED",
      errorMessage: message,
    });

    return {
      ok: true,
      answer,
      mode: "fallback" as const,
      model,
      context,
      requestId: requestLog?.id ?? null,
      warning: message,
    };
  }
}
