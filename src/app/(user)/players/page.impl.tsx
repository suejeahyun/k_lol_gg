export const dynamic = "force-dynamic";

import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import PlayerSearchBox from "./PlayerSearchBox";
import SafeChampionImage from "@/components/SafeChampionImage";
import TierIcon from "@/components/TierIcon";
import { ensureSeasonStats, getWinRate } from "@/lib/stats/season-performance";
import { parsePositivePage } from "@/lib/http/pagination";

type PlayersPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    order?: string;
    position?: string;
    tier?: string;
    status?: string;
  }>;
};

type SortType =
  | "name"
  | "totalGames"
  | "winRate"
  | "mvpCount"
  | "peakTier"
  | "currentTier";

type OrderType = "asc" | "desc";

const PAGE_SIZE = 10;

const POSITION_FILTERS = [
  { value: "ALL", label: "전체" },
  { value: "TOP", label: "TOP" },
  { value: "JGL", label: "JGL" },
  { value: "MID", label: "MID" },
  { value: "ADC", label: "ADC" },
  { value: "SUP", label: "SUP" },
] as const;

const TIER_FILTERS = [
  { value: "ALL", label: "전체 티어" },
  { value: "아이언", label: "아이언" },
  { value: "브론즈", label: "브론즈" },
  { value: "실버", label: "실버" },
  { value: "골드", label: "골드" },
  { value: "플래티넘", label: "플래티넘" },
  { value: "에메랄드", label: "에메랄드" },
  { value: "다이아", label: "다이아" },
  { value: "마스터", label: "마스터" },
  { value: "그랜드마스터", label: "그마" },
  { value: "챌린저", label: "챌린저" },
] as const;

const STATUS_FILTERS = [
  { value: "ALL", label: "전체 상태" },
  { value: "ace", label: "ACE" },
  { value: "stable", label: "STABLE" },
  { value: "normal", label: "NORMAL" },
  { value: "slump", label: "SLUMP" },
  { value: "need-data", label: "NEED DATA" },
] as const;

function getSort(sort?: string): SortType {
  if (
    sort === "name" ||
    sort === "totalGames" ||
    sort === "winRate" ||
    sort === "mvpCount" ||
    sort === "peakTier" ||
    sort === "currentTier"
  ) {
    return sort;
  }

  return "winRate";
}

function getOrder(order?: string): OrderType {
  return order === "asc" ? "asc" : "desc";
}

function getFilterValue<T extends readonly { value: string }[]>(
  filters: T,
  value?: string,
) {
  const normalized = value?.trim() ?? "ALL";
  return filters.some((filter) => filter.value === normalized)
    ? normalized
    : "ALL";
}

function buildPlayerSearchWhere(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return { isActive: true };
  }

  const normalized = trimmed.replace(/\s+/g, "");
  const parts = normalized.split("#").filter(Boolean);

  if (parts.length >= 2) {
    const nicknamePart = parts[0];
    const tagPart = parts.slice(1).join("#");

    return {
      isActive: true,
      OR: [
        {
          name: {
            contains: trimmed,
            mode: "insensitive" as const,
          },
        },
        {
          AND: [
            {
              nickname: {
                contains: nicknamePart,
                mode: "insensitive" as const,
              },
            },
            {
              tag: {
                contains: tagPart,
                mode: "insensitive" as const,
              },
            },
          ],
        },
      ],
    };
  }

  return {
    isActive: true,
    OR: [
      {
        name: {
          contains: trimmed,
          mode: "insensitive" as const,
        },
      },
      {
        nickname: {
          contains: trimmed,
          mode: "insensitive" as const,
        },
      },
      {
        tag: {
          contains: trimmed,
          mode: "insensitive" as const,
        },
      },
    ],
  };
}

function tierRank(value: string | null) {
  if (!value) return -1;

  const normalized = value.trim();

  const baseOrder: Record<string, number> = {
    아이언: 1,
    브론즈: 2,
    실버: 3,
    골드: 4,
    플래티넘: 5,
    에메랄드: 6,
    다이아: 7,
    마스터: 8,
    그랜드마스터: 9,
    챌린저: 10,
  };

  const [tier, detailRaw] = normalized.split(" ");
  const tierScore = baseOrder[tier] ?? 0;

  if (
    tier === "아이언" ||
    tier === "브론즈" ||
    tier === "실버" ||
    tier === "골드" ||
    tier === "플래티넘" ||
    tier === "에메랄드" ||
    tier === "다이아"
  ) {
    const division = Number(detailRaw ?? "0");
    return tierScore * 100 + (5 - division);
  }

  if (tier === "마스터") {
    const floor = Number((detailRaw ?? "").replace("층", ""));
    return tierScore * 100 + floor;
  }

  if (tier === "그랜드마스터" || tier === "챌린저") {
    const score = Number(detailRaw ?? "0");
    return tierScore * 100000 + score;
  }

  return 0;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";

  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function formatMvp(value: number) {
  return `${value}회`;
}

function getPrimaryPosition(
  positionStats: Array<{
    position: string;
    games: number;
  }>
) {
  if (positionStats.length === 0) return "-";

  return [...positionStats].sort((a, b) => b.games - a.games)[0]?.position ?? "-";
}

function getPlayerStatus({
  totalGames,
  winRate,
  mvpCount,
}: {
  totalGames: number;
  winRate: number;
  mvpCount: number;
}) {
  if (totalGames < 3) {
    return {
      label: "NEED DATA",
      className: "need-data",
    };
  }

  if (winRate >= 60 && mvpCount >= 2) {
    return {
      label: "ACE",
      className: "ace",
    };
  }

  if (winRate >= 55) {
    return {
      label: "STABLE",
      className: "stable",
    };
  }

  if (winRate < 45) {
    return {
      label: "SLUMP",
      className: "slump",
    };
  }

  return {
    label: "NORMAL",
    className: "normal",
  };
}

function getWinRateTone(winRate: number) {
  if (winRate >= 60) return "good";
  if (winRate < 45) return "danger";
  return "normal";
}

function getMvpTone(mvpCount: number) {
  if (mvpCount >= 3) return "gold";
  if (mvpCount >= 1) return "good";
  return "normal";
}

function matchesTierFilter(
  currentTier: string | null,
  peakTier: string | null,
  tierFilter: string,
) {
  if (tierFilter === "ALL") return true;

  return [currentTier, peakTier].some((tier) =>
    tier?.trim().startsWith(tierFilter),
  );
}

async function getPlayersCatalog(seasonId: number | null, query: string) {
  if (seasonId) {
    await ensureSeasonStats(seasonId);
  }

  return prisma.player.findMany({
      where: buildPlayerSearchWhere(query),
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        peakTier: true,
        currentTier: true,
        seasonStats: {
          where: { seasonId: seasonId ?? -1 },
          select: {
            totalGames: true,
            participationCount: true,
            wins: true,
            losses: true,
            mvpCount: true,
          },
          take: 1,
        },
        positionStats: {
          where: { seasonId: seasonId ?? -1 },
          select: {
            position: true,
            games: true,
          },
          orderBy: {
            games: "desc",
          },
        },
        championStats: {
          where: { seasonId: seasonId ?? -1 },
          orderBy: [{ games: "desc" }, { wins: "desc" }],
          take: 3,
          select: {
            games: true,
            wins: true,
            mvpCount: true,
            champion: {
              select: {
                name: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: {
        id: "asc",
      },
  });
}

const getCachedPlayersCatalog = unstable_cache(
  async (seasonId: number | null) => getPlayersCatalog(seasonId, ""),
  ["players-page-catalog-v1"],
  { revalidate: 60, tags: ["players", "rankings", "stats-top"] },
);

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const resolved = await searchParams;

  const currentPage = parsePositivePage(resolved.page);
  const query = resolved.q?.trim() ?? "";
  const sort = getSort(resolved.sort);
  const order = getOrder(resolved.order);
  const positionFilter = getFilterValue(POSITION_FILTERS, resolved.position);
  const tierFilter = getFilterValue(TIER_FILTERS, resolved.tier);
  const statusFilter = getFilterValue(STATUS_FILTERS, resolved.status);

  const currentSeason = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true },
  });

  const seasonId = currentSeason?.id ?? null;
  const players = query
    ? await getPlayersCatalog(seasonId, query)
    : await getCachedPlayersCatalog(seasonId);

  const mapped = players.map((player: (typeof players)[number]) => {
    const seasonStat = player.seasonStats[0] ?? null;
    const totalGames = seasonStat?.totalGames ?? 0;
    const participationCount = seasonStat?.participationCount ?? 0;
    const wins = seasonStat?.wins ?? 0;
    const winRate = getWinRate(wins, totalGames);
    const mvpCount = seasonStat?.mvpCount ?? 0;
    const primaryPosition = getPrimaryPosition(player.positionStats);

    const status = getPlayerStatus({
      totalGames,
      winRate,
      mvpCount,
    });

    return {
      id: player.id,
      name: player.name,
      nickname: player.nickname ?? "",
      tag: player.tag ?? "",
      peakTier: player.peakTier ?? null,
      currentTier: player.currentTier ?? null,
      totalGames,
      participationCount,
      winRate,
      mvpCount,
      primaryPosition,
      status,
      topChampions: player.championStats.map((stat) => ({
        name: stat.champion.name,
        imageUrl: stat.champion.imageUrl,
        games: stat.games,
        winRate: getWinRate(stat.wins, stat.games),
        mvpCount: stat.mvpCount,
      })),
    };
  });

  const filtered = mapped.filter((player) => {
    const matchesPosition =
      positionFilter === "ALL" || player.primaryPosition === positionFilter;
    const matchesTier = matchesTierFilter(
      player.currentTier,
      player.peakTier,
      tierFilter,
    );
    const matchesStatus =
      statusFilter === "ALL" || player.status.className === statusFilter;

    return matchesPosition && matchesTier && matchesStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let result = 0;

    if (sort === "name") result = a.name.localeCompare(b.name);
    if (sort === "totalGames") result = a.totalGames - b.totalGames;
    if (sort === "winRate") result = a.winRate - b.winRate;
    if (sort === "mvpCount") result = a.mvpCount - b.mvpCount;
    if (sort === "peakTier") result = tierRank(a.peakTier) - tierRank(b.peakTier);
    if (sort === "currentTier") {
      result = tierRank(a.currentTier) - tierRank(b.currentTier);
    }

    return order === "asc" ? result : -result;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paged = sorted.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );
  const mostActivePlayer = [...filtered]
    .filter((player) => player.participationCount > 0)
    .sort((a, b) => {
      if (b.participationCount !== a.participationCount) {
        return b.participationCount - a.participationCount;
      }
      if (b.totalGames !== a.totalGames) return b.totalGames - a.totalGames;
      return b.winRate - a.winRate;
    })[0];

  const highestWinRatePlayer = [...filtered]
    .filter((player) => player.totalGames >= 3)
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.totalGames - a.totalGames;
    })[0];

  const highestMvpPlayer = [...filtered]
    .sort((a, b) => {
      if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
      return b.totalGames - a.totalGames;
    })[0];

  const highestTierPlayer = [...filtered].sort(
    (a, b) => tierRank(b.peakTier) - tierRank(a.peakTier)
  )[0];

  function buildPlayersHref({
    nextSort = sort,
    nextOrder = order,
    nextPosition = positionFilter,
    nextTier = tierFilter,
    nextStatus = statusFilter,
    page = "1",
  }: {
    nextSort?: SortType;
    nextOrder?: OrderType;
    nextPosition?: string;
    nextTier?: string;
    nextStatus?: string;
    page?: string;
  } = {}) {
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    if (nextPosition !== "ALL") params.set("position", nextPosition);
    if (nextTier !== "ALL") params.set("tier", nextTier);
    if (nextStatus !== "ALL") params.set("status", nextStatus);
    if (nextSort !== "winRate" || nextOrder !== "desc") {
      params.set("sort", nextSort);
      params.set("order", nextOrder);
    }
    if (page !== "1") params.set("page", page);

    const queryString = params.toString();
    return queryString ? `/players?${queryString}` : "/players";
  }

  function sortLink(field: SortType) {
    const nextOrder = sort === field && order === "desc" ? "asc" : "desc";
    return buildPlayersHref({
      nextSort: field,
      nextOrder,
    });
  }

  return (
    <main className="page-container players-page-v2">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">PLAYER LIST</p>
          <h1 className="page-title">플레이어 목록</h1>
        </div>
      </div>

      <section className="card balance-form-card players-page-v2__panel">
        <div className="players-page-v2__search">
          <PlayerSearchBox initialQuery={query} />
        </div>

        <div className="players-page-v2__filters" role="group" aria-label="플레이어 필터">
          <div className="players-page-v2__filter-group">
            <span>라인</span>
            <div>
              {POSITION_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={buildPlayersHref({ nextPosition: filter.value })}
                  className={`players-page-v2__filter-chip ${
                    positionFilter === filter.value
                      ? "players-page-v2__filter-chip--active"
                      : ""
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="players-page-v2__filter-group">
            <span>티어</span>
            <div>
              {TIER_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={buildPlayersHref({ nextTier: filter.value })}
                  className={`players-page-v2__filter-chip ${
                    tierFilter === filter.value
                      ? "players-page-v2__filter-chip--active"
                      : ""
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="players-page-v2__filter-group">
            <span>상태</span>
            <div>
              {STATUS_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={buildPlayersHref({ nextStatus: filter.value })}
                  className={`players-page-v2__filter-chip ${
                    statusFilter === filter.value
                      ? "players-page-v2__filter-chip--active"
                      : ""
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

      <section className="players-page-v2__summary" aria-label="플레이어 요약">
        <div className="players-page-v2__summary-card">
          <span>조회 플레이어</span>
          <strong>{filtered.length}</strong>
        </div>

        <div className="players-page-v2__summary-card players-page-v2__summary-card--wide">
          <span>최다 참여</span>
          <strong>
            {mostActivePlayer
              ? `${mostActivePlayer.name} · ${mostActivePlayer.participationCount}회`
              : "없음"}
          </strong>
        </div>

        <div className="players-page-v2__summary-card players-page-v2__summary-card--wide">
          <span>최고 승률</span>
          <strong>
            {highestWinRatePlayer
              ? `${highestWinRatePlayer.name} · ${formatPercent(highestWinRatePlayer.winRate)}`
              : "없음"}
          </strong>
        </div>

        <div className="players-page-v2__summary-card players-page-v2__summary-card--wide">
          <span>최다 MVP</span>
          <strong>
            {highestMvpPlayer
              ? `${highestMvpPlayer.name} · ${formatMvp(highestMvpPlayer.mvpCount)}`
              : "없음"}
          </strong>
        </div>

        <div className="players-page-v2__summary-card players-page-v2__summary-card--wide">
          <span>최고 티어</span>
          <strong>
            {highestTierPlayer
              ? `${highestTierPlayer.name} · ${highestTierPlayer.peakTier ?? "-"}`
              : "없음"}
          </strong>
        </div>
      </section>

        <div className="players-page-v2__board">
          <div className="players-page-v2__board-head">
            <div>
              <p className="players-page-v2__eyebrow">PLAYER DATA</p>
              <h2>플레이어 데이터</h2>
            </div>

            <div className="players-page-v2__meta">
              <span>검색 결과 {sorted.length}명</span>
              <span>{order === "desc" ? "내림차순" : "오름차순"}</span>
            </div>
          </div>

          <div className="players-page-v2__header">
            <Link href={sortLink("name")}>플레이어</Link>
            <div>닉네임#태그</div>
            <Link href={sortLink("currentTier")}>티어 정보</Link>
            <div>주 포지션</div>
            <Link href={sortLink("totalGames")}>전적</Link>
            <Link href={sortLink("winRate")}>승률</Link>
            <Link href={sortLink("mvpCount")}>MVP</Link>
            <div>상태</div>
          </div>

          {paged.length === 0 ? (
            <p className="players-page-v2__empty">플레이어 데이터가 없습니다.</p>
          ) : (
            <div className="players-page-v2__list">
              {paged.map((player) => (
                <Link
                  key={player.id}
                  href={`/players/${player.id}`}
                  className="players-page-v2__row"
                >
                  <div className="players-page-v2__cell players-page-v2__name">
                    <strong>{player.name}</strong>
                    {player.topChampions.length > 0 ? (
                      <div className="players-page-v2__champions">
                        {player.topChampions.map((champion) => (
                          <span
                            key={champion.name}
                            className="players-page-v2__champion-pill"
                            title={`${champion.name} · ${champion.games}회 · 승률 ${formatPercent(
                              champion.winRate,
                            )}`}
                          >
                            <SafeChampionImage
                              src={champion.imageUrl}
                              alt={champion.name}
                              width={22}
                              height={22}
                              className="players-page-v2__champion-image"
                              fallbackClassName="players-page-v2__champion-image players-page-v2__champion-image--empty"
                            />
                            <span>{champion.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="players-page-v2__cell players-page-v2__riot">
                    {player.nickname}#{player.tag}
                  </div>

                  <div className="players-page-v2__cell players-page-v2__tier-stack">
                    <div className="players-page-v2__tier-line">
                      <span>현재</span>
                      <TierIcon tier={player.currentTier} size={22} showText />
                    </div>

                    <div className="players-page-v2__tier-line players-page-v2__tier-line--sub">
                      <span>최고</span>
                      <TierIcon tier={player.peakTier} size={20} showText />
                    </div>
                  </div>

                  <div className="players-page-v2__cell">
                    <span className="players-page-v2__position-pill">
                      {player.primaryPosition}
                    </span>
                  </div>

                  <div className="players-page-v2__cell">
                    <span className="players-page-v2__stat-pill">
                      {player.totalGames}전
                    </span>
                  </div>

                  <div className="players-page-v2__cell">
                    <span
                      className={`players-page-v2__stat-pill players-page-v2__stat-pill--${getWinRateTone(
                        player.winRate
                      )}`}
                    >
                      {formatPercent(player.winRate)}
                    </span>
                  </div>

                  <div className="players-page-v2__cell">
                    <span
                      className={`players-page-v2__stat-pill players-page-v2__stat-pill--${getMvpTone(
                        player.mvpCount
                      )}`}
                    >
                      {formatMvp(player.mvpCount)}
                    </span>
                  </div>

                  <div className="players-page-v2__cell">
                    <span
                      className={`players-page-v2__status players-page-v2__status--${player.status.className}`}
                    >
                      {player.status.label}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            basePath="/players"
            query={{
              q: query,
              sort: sort !== "winRate" || order !== "desc" ? sort : undefined,
              order: sort !== "winRate" || order !== "desc" ? order : undefined,
              position:
                positionFilter !== "ALL" ? String(positionFilter) : undefined,
              tier: tierFilter !== "ALL" ? String(tierFilter) : undefined,
              status:
                statusFilter !== "ALL" ? String(statusFilter) : undefined,
            }}
          />
        </div>
      </section>
    </main>
  );
}
