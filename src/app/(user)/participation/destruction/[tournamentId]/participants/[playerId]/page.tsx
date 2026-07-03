export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import SafeChampionImage from "@/components/SafeChampionImage";
import SoloRankSection from "@/components/SoloRankSection";
import TierIcon from "@/components/TierIcon";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { calculateDestructionPublicApplicationIds, getDestructionLaneLimits } from "@/lib/destruction/recruitment-auto-reserve";
import { getGameMvpParticipant } from "@/lib/mvp";
import { ensureSeasonStats, getWinRate } from "@/lib/stats/season-performance";

type PageProps = {
  params: Promise<{
    tournamentId: string;
    playerId: string;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "신청",
  CONFIRMED: "확정",
  RESERVE: "자동보류",
  CANCELLED: "취소",
  REJECTED: "제외",
};

function formatPositions(positions: string[] | null | undefined) {
  if (!positions || positions.length === 0) return "-";
  return positions.join(" / ");
}

function formatDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function DestructionParticipantDetailPage({ params }: PageProps) {
  const { tournamentId, playerId } = await params;
  const tournamentNumericId = Number(tournamentId);
  const playerNumericId = Number(playerId);

  if (!Number.isInteger(tournamentNumericId) || tournamentNumericId <= 0 || !Number.isInteger(playerNumericId) || playerNumericId <= 0) {
    notFound();
  }

  const currentSeason = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (currentSeason) {
    await ensureSeasonStats(currentSeason.id);
  }

  const applyInclude = {
    tournament: {
      select: {
        id: true,
        title: true,
        status: true,
        topLaneLimit: true,
        jungleLaneLimit: true,
        midLaneLimit: true,
        adcLaneLimit: true,
        supportLaneLimit: true,
      },
    },
    player: {
      include: {
        seasonStats: {
          where: { seasonId: currentSeason?.id ?? -1 },
          select: {
            totalGames: true,
            participationCount: true,
            wins: true,
            losses: true,
            mvpCount: true,
          },
          take: 1,
        },
        participants: {
          where: currentSeason
            ? {
                game: {
                  series: {
                    seasonId: currentSeason.id,
                  },
                },
              }
            : { id: -1 },
          orderBy: {
            game: {
              series: {
                matchDate: "desc",
              },
            },
          },
          take: 20,
          include: {
            champion: true,
            game: {
              include: {
                series: {
                  include: {
                    season: true,
                  },
                },
                participants: {
                  select: {
                    playerId: true,
                    kills: true,
                    deaths: true,
                    assists: true,
                    team: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.DestructionParticipationApplyInclude;

  // 이 상세 URL의 마지막 값은 기존 운영 기준상 playerId입니다.
  // 같은 숫자의 신청 id가 존재할 수 있으므로 playerId 신청을 우선 조회하고,
  // 과거 공유 링크 호환을 위해 신청 id 조회는 fallback으로만 사용합니다.
  const apply =
    (await prisma.destructionParticipationApply.findFirst({
      where: {
        tournamentId: tournamentNumericId,
        playerId: playerNumericId,
        status: {
          in: ["APPLIED", "CONFIRMED", "RESERVE"],
        },
      },
      orderBy: [
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      include: applyInclude,
    })) ??
    (await prisma.destructionParticipationApply.findFirst({
      where: {
        id: playerNumericId,
        tournamentId: tournamentNumericId,
        status: {
          in: ["APPLIED", "CONFIRMED", "RESERVE"],
        },
      },
      include: applyInclude,
    }));

  if (!apply) {
    notFound();
  }

  const applyStatusCandidates = await prisma.destructionParticipationApply.findMany({
    where: {
      tournamentId: tournamentNumericId,
      status: {
        in: ["APPLIED", "CONFIRMED", "RESERVE"],
      },
    },
    select: {
      id: true,
      status: true,
      mainPosition: true,
      createdAt: true,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
  const laneLimits = getDestructionLaneLimits(apply.tournament);
  const { capacityOverflowIds, laneOverflowIds } = calculateDestructionPublicApplicationIds(applyStatusCandidates, laneLimits);
  const isCapacityOverflow = capacityOverflowIds.has(apply.id);
  const isLaneOverflow = laneOverflowIds.has(apply.id);

  if (isLaneOverflow && !isCapacityOverflow) {
    notFound();
  }

  const publicStatusLabel = isCapacityOverflow
    ? "정원 초과"
    : isLaneOverflow
      ? "라인 초과"
      : apply.status === "RESERVE"
        ? "보류"
        : (STATUS_LABELS[apply.status] ?? apply.status);

  const player = apply.player;
  const playerTagText = [player.nickname, player.tag].filter(Boolean).join("#");
  const applyMessage = typeof apply.message === "string" ? apply.message.trim() : "";
  const seasonStat = player.seasonStats[0] ?? null;
  const totalGames = seasonStat?.totalGames ?? player.participants.length;
  const participationCount = seasonStat?.participationCount ?? 0;
  const wins = seasonStat?.wins ?? player.participants.filter(
    (participant) => participant.game.winnerTeam === participant.team,
  ).length;
  const losses = seasonStat?.losses ?? totalGames - wins;
  const winRate = getWinRate(wins, totalGames);

  const getMvpPlayerId = (participant: (typeof player.participants)[number]) => {
    if (participant.game.mvpPlayerId) return participant.game.mvpPlayerId;

    const mvp = getGameMvpParticipant(
      participant.game.participants,
      participant.game.winnerTeam,
    );

    return mvp?.playerId ?? null;
  };

  const mvpCount = seasonStat?.mvpCount ?? player.participants.filter((participant) => {
    return getMvpPlayerId(participant) === player.id;
  }).length;

  const lineStats = Array.from(
    player.participants.reduce((map, participant) => {
      const key = participant.position;
      const prev = map.get(key) ?? { position: key, games: 0, wins: 0 };
      prev.games += 1;
      if (participant.game.winnerTeam === participant.team) prev.wins += 1;
      map.set(key, prev);
      return map;
    }, new Map<string, { position: string; games: number; wins: number }>()).values(),
  ).sort((a, b) => b.games - a.games || b.wins - a.wins);

  const championStats = Array.from(
    player.participants
      .reduce((map, participant) => {
        const championId = participant.champion.id;
        const isWin = participant.game.winnerTeam === participant.team;

        const prev = map.get(championId) ?? {
          championId,
          championName: participant.champion.name,
          imageUrl: participant.champion.imageUrl,
          games: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          mvpCount: 0,
        };

        prev.games += 1;
        prev.kills += participant.kills;
        prev.deaths += participant.deaths;
        prev.assists += participant.assists;

        if (getMvpPlayerId(participant) === player.id) {
          prev.mvpCount += 1;
        }

        if (isWin) {
          prev.wins += 1;
        }

        map.set(championId, prev);
        return map;
      }, new Map<
        number,
        {
          championId: number;
          championName: string;
          imageUrl: string | null;
          games: number;
          wins: number;
          kills: number;
          deaths: number;
          assists: number;
          mvpCount: number;
        }
      >())
      .values(),
  ).sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 10);

  return (
    <main className="page-shell player-detail-page">
      <div className="page-header player-hero">
        <div>
          <p className="page-eyebrow">멸망전 참가자 상세</p>
          <h1 className="page-title">
            {player.name}{playerTagText ? ` (${playerTagText})` : ""}
          </h1>
          <p className="page-description">
            {apply.tournament.title} 참가 정보입니다.
          </p>
        </div>

        <div className="page-actions">
          <Link href={`/participation/destruction/${apply.tournament.id}/participants`} className="btn btn-ghost">
            명단으로
          </Link>
          <Link href={`/players/${player.id}`} className="btn btn-ghost">
            일반 상세
          </Link>
        </div>
      </div>

      <section className="content-section player-panel destruction-detail-apply-section">
        <div className="section-header section-header--split">
          <div>
            <h2>신청 정보</h2>
            <p className="section-subtitle">라인, 팀장 선호, 각오만 우선 확인합니다.</p>
          </div>
        </div>

        <div className="info-grid">
          <div className="info-card">
            <span className="info-card__label">신청 상태</span>
            <strong className="info-card__value">{publicStatusLabel}</strong>
          </div>
          <div className="info-card">
            <span className="info-card__label">주 포지션</span>
            <strong className="info-card__value">{apply.mainPosition}</strong>
          </div>
          <div className="info-card">
            <span className="info-card__label">부 포지션</span>
            <strong className="info-card__value">{formatPositions(apply.subPositions)}</strong>
          </div>
          <div className="info-card">
            <span className="info-card__label">팀장 선호</span>
            <strong className="info-card__value">{apply.isCaptain ? "선호" : "비선호"}</strong>
          </div>
          <div className="info-card destruction-detail-date-card">
            <span className="info-card__label">신청일</span>
            <strong className="info-card__value">{formatDateTime(apply.createdAt)}</strong>
          </div>
          <div className="info-card destruction-detail-date-card">
            <span className="info-card__label">수정일</span>
            <strong className="info-card__value">{formatDateTime(apply.updatedAt)}</strong>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "18px 20px",
            borderRadius: 16,
            border: "1px solid rgba(250, 204, 21, 0.45)",
            background: "rgba(250, 204, 21, 0.08)",
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: "#facc15",
              marginBottom: 10,
            }}
          >
            각오 한마디
          </div>
          <div
            style={{
              minHeight: 48,
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.10)",
              background: "rgba(15, 23, 42, 0.72)",
              color: "#f8fafc",
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {applyMessage || "입력된 각오가 없습니다."}
          </div>
        </div>
      </section>

      <section className="content-section player-panel destruction-detail-profile-section">
        <div className="section-header">
          <h2>프로필</h2>
        </div>

        <div className="info-grid">
          <div className="info-card">
            <span className="info-card__label">이름</span>
            <strong className="info-card__value">{player.name}</strong>
          </div>
          <div className="info-card">
            <span className="info-card__label">닉네임#태그</span>
            <strong className="info-card__value">{player.nickname}#{player.tag}</strong>
          </div>
          <div className="info-card">
            <span className="info-card__label">현재 티어</span>
            <TierIcon tier={player.currentTier} size={26} showText />
          </div>
          <div className="info-card">
            <span className="info-card__label">최고 티어</span>
            <TierIcon tier={player.peakTier} size={26} showText />
          </div>
        </div>
      </section>

      <section className="content-section player-panel destruction-detail-stats-section">
        <div className="section-header section-header--split">
          <div>
            <h2>내전 요약</h2>
            <p className="section-subtitle">
              현재 시즌{currentSeason ? `(${currentSeason.name})` : ""} 내전 기록 기준 통계입니다.
            </p>
          </div>
        </div>

        <div className="card-grid player-stat-grid">
          <article className="stat-card">
            <span className="stat-card__label">참여 횟수</span>
            <strong className="stat-card__value">{participationCount}회</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">총 경기</span>
            <strong className="stat-card__value">{totalGames}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">승 / 패</span>
            <strong className="stat-card__value">{wins}승 {losses}패</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">승률</span>
            <strong className="stat-card__value">{winRate}%</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">MVP</span>
            <strong className="stat-card__value">{mvpCount}회</strong>
          </article>
        </div>
      </section>

      <section className="content-section player-panel destruction-detail-extra-section">
        <div className="section-header">
          <h2>라인별 기록</h2>
        </div>
        {lineStats.length === 0 ? (
          <div className="empty-box">라인별 기록이 없습니다.</div>
        ) : (
          <div className="admin-event-detail-grid">
            {lineStats.map((item) => (
              <div key={item.position} className="admin-event-detail-card">
                <span>{item.position}</span>
                <strong>{item.games}전 · 승률 {Math.round((item.wins / item.games) * 100)}%</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-section player-panel champion-section destruction-detail-extra-section">
        <div className="section-header section-header--split">
          <div>
            <h2>내전 사용 챔피언 통계</h2>
            <p className="section-subtitle">최근 시즌 기준 상위 10개 챔피언입니다.</p>
          </div>
        </div>

        {championStats.length === 0 ? (
          <div className="empty-box">사용한 챔피언 기록이 없습니다.</div>
        ) : (
          <div className="champion-stat-grid">
            {championStats.map((champion) => {
              const championLosses = champion.games - champion.wins;
              const championWinRate = Math.round((champion.wins / champion.games) * 100);

              return (
                <article key={champion.championId} className="champion-stat-card">
                  <div className="champion-stat-card__main">
                    <SafeChampionImage
                      src={champion.imageUrl}
                      alt={champion.championName}
                      width={52}
                      height={52}
                      className="champion-stat-card__image"
                      fallbackClassName="champion-stat-card__image champion-stat-card__image--empty"
                    />
                    <div className="champion-stat-card__text">
                      <strong>{champion.championName}</strong>
                      <span>{champion.wins}승 {championLosses}패 · MVP {champion.mvpCount}회</span>
                    </div>
                  </div>
                  <div className="champion-stat-card__numbers">
                    <strong>{champion.games}회</strong>
                    <span>승률 {championWinRate}%</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="destruction-detail-extra-section">
        <SoloRankSection playerId={player.id} />
      </div>

      <section className="content-section player-panel destruction-detail-extra-section">
        <div className="section-header">
          <h2>내전 최근 기록</h2>
        </div>

        {player.participants.length === 0 ? (
          <div className="empty-box">등록된 내전 기록이 없습니다.</div>
        ) : (
          <div className="match-list">
            {player.participants.map((participant) => {
              const isWin = participant.game.winnerTeam === participant.team;

              return (
                <article key={participant.id} className={`match-card ${isWin ? "match-card--win" : "match-card--loss"}`}>
                  <div className="match-card__top">
                    <div>
                      <strong className="match-card__queue">{participant.game.series.title}</strong>
                      <p className="match-card__date">{formatDateTime(participant.game.series.matchDate)}</p>
                    </div>
                    <div className="match-card__result">
                      <span>{isWin ? "승리" : "패배"}</span>
                      <span>세트 {participant.game.gameNumber}</span>
                    </div>
                  </div>
                  <div className="match-card__body">
                    <div className="match-card__champion">
                      <strong>{participant.champion.name}</strong>
                      <span>{participant.position}</span>
                    </div>
                    <div className="match-card__score">
                      <strong>{participant.kills} / {participant.deaths} / {participant.assists}</strong>
                      <span>팀 {participant.team}</span>
                    </div>
                    <div className="match-card__damage">
                      <span>시즌 {participant.game.series.season.name}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}


