import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import PlayerSearchBox from "./PlayerSearchBox";
import TierIcon from "@/components/TierIcon";

type PlayersPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    order?: string;
  }>;
};

type SortType =
  | "name"
  | "totalGames"
  | "winRate"
  | "kda"
  | "peakTier"
  | "currentTier";

type OrderType = "asc" | "desc";

const PAGE_SIZE = 10;

function getSort(sort?: string): SortType {
  if (
    sort === "name" ||
    sort === "totalGames" ||
    sort === "winRate" ||
    sort === "kda" ||
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

function buildPlayerSearchWhere(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return {};
  }

  const normalized = trimmed.replace(/\s+/g, "");
  const parts = normalized.split("#").filter(Boolean);

  if (parts.length >= 2) {
    const nicknamePart = parts[0];
    const tagPart = parts.slice(1).join("#");

    return {
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

function formatKda(value: number) {
  if (!Number.isFinite(value)) return "0";

  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
}

function getPrimaryPosition(
  participants: Array<{
    position: string;
  }>
) {
  if (participants.length === 0) return "-";

  const countMap = participants.reduce<Record<string, number>>(
    (acc, participant) => {
      acc[participant.position] = (acc[participant.position] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const [position] =
    Object.entries(countMap).sort((a, b) => b[1] - a[1])[0] ?? [];

  return position ?? "-";
}

function getPlayerStatus({
  totalGames,
  winRate,
  kda,
}: {
  totalGames: number;
  winRate: number;
  kda: number;
}) {
  if (totalGames < 3) {
    return {
      label: "NEED DATA",
      className: "need-data",
    };
  }

  if (winRate >= 65 && kda >= 3) {
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

function getKdaTone(kda: number) {
  if (kda >= 3) return "gold";
  if (kda >= 2) return "good";
  return "normal";
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const resolved = await searchParams;

  const currentPage = Math.max(1, Number(resolved.page ?? "1") || 1);
  const query = resolved.q?.trim() ?? "";
  const sort = getSort(resolved.sort);
  const order = getOrder(resolved.order);

  const players = await prisma.player.findMany({
    where: buildPlayerSearchWhere(query),
    include: {
      participants: {
        select: {
          kills: true,
          deaths: true,
          assists: true,
          team: true,
          position: true,
          game: {
            select: {
              winnerTeam: true,
            },
          },
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  const mapped = players.map((player: (typeof players)[number]) => {
    const totalGames = player.participants.length;

    const wins = player.participants.filter(
      (participant: (typeof player.participants)[number]) =>
        participant.team === participant.game.winnerTeam
    ).length;

    const totalKills = player.participants.reduce(
      (sum: number, participant: (typeof player.participants)[number]) =>
        sum + participant.kills,
      0
    );

    const totalDeaths = player.participants.reduce(
      (sum: number, participant: (typeof player.participants)[number]) =>
        sum + participant.deaths,
      0
    );

    const totalAssists = player.participants.reduce(
      (sum: number, participant: (typeof player.participants)[number]) =>
        sum + participant.assists,
      0
    );

    const winRate =
      totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

    const kda =
      totalDeaths === 0
        ? Number((totalKills + totalAssists).toFixed(2))
        : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

    const primaryPosition = getPrimaryPosition(player.participants);

    const status = getPlayerStatus({
      totalGames,
      winRate,
      kda,
    });

    return {
      id: player.id,
      name: player.name,
      nickname: player.nickname ?? "",
      tag: player.tag ?? "",
      peakTier: player.peakTier ?? null,
      currentTier: player.currentTier ?? null,
      totalGames,
      winRate,
      kda,
      primaryPosition,
      status,
    };
  });

  const sorted = [...mapped].sort((a, b) => {
    let result = 0;

    if (sort === "name") result = a.name.localeCompare(b.name);
    if (sort === "totalGames") result = a.totalGames - b.totalGames;
    if (sort === "winRate") result = a.winRate - b.winRate;
    if (sort === "kda") result = a.kda - b.kda;
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
  const mostActivePlayer = [...mapped].sort((a, b) => {
    if (b.totalGames !== a.totalGames) return b.totalGames - a.totalGames;
    return b.winRate - a.winRate;
  })[0];

  const highestWinRatePlayer = [...mapped]
    .filter((player) => player.totalGames >= 3)
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.totalGames - a.totalGames;
    })[0];

  const highestKdaPlayer = [...mapped]
    .filter((player) => player.totalGames >= 3)
    .sort((a, b) => {
      if (b.kda !== a.kda) return b.kda - a.kda;
      return b.totalGames - a.totalGames;
    })[0];

  const highestTierPlayer = [...mapped].sort(
    (a, b) => tierRank(b.peakTier) - tierRank(a.peakTier)
  )[0];

  function sortLink(field: SortType) {
    const nextOrder = sort === field && order === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    params.set("sort", field);
    params.set("order", nextOrder);
    params.set("page", "1");

    return `/players?${params.toString()}`;
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

      <section className="players-page-v2__summary" aria-label="플레이어 요약">
        <div className="players-page-v2__summary-card">
          <span>총 플레이어</span>
          <strong>{mapped.length}</strong>
        </div>

        <div className="players-page-v2__summary-card players-page-v2__summary-card--wide">
          <span>최다 참여</span>
          <strong>
            {mostActivePlayer
              ? `${mostActivePlayer.name} · ${mostActivePlayer.totalGames}전`
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
          <span>최고 KDA</span>
          <strong>
            {highestKdaPlayer
              ? `${highestKdaPlayer.name} · ${formatKda(highestKdaPlayer.kda)}`
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
            <Link href={sortLink("kda")}>KDA</Link>
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
                    {player.name}
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
                      className={`players-page-v2__stat-pill players-page-v2__stat-pill--${getKdaTone(
                        player.kda
                      )}`}
                    >
                      {formatKda(player.kda)}
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
            query={{ q: query, sort, order }}
          />
        </div>
      </section>
    </main>
  );
}