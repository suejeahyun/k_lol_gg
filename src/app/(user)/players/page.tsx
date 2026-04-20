import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import PlayerSearchBox from "./PlayerSearchBox";

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
    name: {
      contains: trimmed,
      mode: "insensitive" as const,
    },
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

  const paged = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function sortLink(field: SortType) {
    const nextOrder = sort === field && order === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    params.set("sort", field);
    params.set("order", nextOrder);

    return `/players?${params.toString()}`;
  }

  return (
    <main className="page-container">
      <h1 className="page-title">플레이어 목록</h1>

      <PlayerSearchBox initialQuery={query} />

      <div className="player-row-header clickable">
        <Link href={sortLink("name")}>이름</Link>
        <div>닉네임#태그</div>
        <Link href={sortLink("peakTier")}>최대티어</Link>
        <Link href={sortLink("currentTier")}>현재티어</Link>
        <Link href={sortLink("totalGames")}>총경기</Link>
        <Link href={sortLink("winRate")}>승률</Link>
        <Link href={sortLink("kda")}>KDA</Link>
      </div>

      <div className="card-grid">
        {paged.map((player) => (
          <Link
            key={player.id}
            href={`/players/${player.id}`}
            className="player-row-card"
          >
            <div
              className="player-row-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.3fr 1fr 1fr .8fr .8fr .8fr",
                gap: 12,
              }}
            >
              <div className="player-name">{player.name}</div>
              <div>
                {player.nickname}#{player.tag}
              </div>
              <div>{player.peakTier ?? "-"}</div>
              <div>{player.currentTier ?? "-"}</div>
              <div>{player.totalGames}</div>
              <div>{player.winRate}%</div>
              <div>{player.kda}</div>
            </div>
          </Link>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/players"
        query={{ q: query, sort, order }}
      />
    </main>
  );
}