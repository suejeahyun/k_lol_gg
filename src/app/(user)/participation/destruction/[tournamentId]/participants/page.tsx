export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import TierIcon from "@/components/TierIcon";
import { getDestructionLaneLimits } from "@/lib/destruction/recruitment-auto-reserve";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
  searchParams: Promise<{
    line?: string;
  }>;
};

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
type Position = (typeof POSITIONS)[number];

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "신청",
  CONFIRMED: "확정",
  RESERVE: "보류",
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

function normalizeLine(value: string | undefined): Position | null {
  const upperValue = value?.toUpperCase();
  if (!upperValue) return null;
  return POSITIONS.includes(upperValue as Position) ? (upperValue as Position) : null;
}

function lineHref(tournamentId: number, line: Position | null) {
  return line
    ? `/participation/destruction/${tournamentId}/participants?line=${line}`
    : `/participation/destruction/${tournamentId}/participants`;
}

export default async function DestructionParticipantsPage({ params, searchParams }: PageProps) {
  const { tournamentId } = await params;
  const { line } = await searchParams;
  const id = Number(tournamentId);
  const selectedLine = normalizeLine(line);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const tournament = await prisma.destructionTournament.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      topLaneLimit: true,
      jungleLaneLimit: true,
      midLaneLimit: true,
      adcLaneLimit: true,
      supportLaneLimit: true,
      participationApplies: {
        where: {
          status: {
            in: ["APPLIED", "CONFIRMED", "RESERVE"],
          },
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              nickname: true,
              tag: true,
              currentTier: true,
              peakTier: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!tournament) {
    notFound();
  }

  const laneLimits = getDestructionLaneLimits(tournament);
  const applies = tournament.participationApplies;
  const activeApplies = applies.filter((apply) => apply.status !== "RESERVE");
  const reserveApplies = applies.filter((apply) => apply.status === "RESERVE");
  const captainPreferredCount = activeApplies.filter((apply) => apply.isCaptain).length;
  const positionCounts = POSITIONS.map((position) => ({
    position,
    count: activeApplies.filter((apply) => apply.mainPosition === position).length,
    reserveCount: reserveApplies.filter((apply) => apply.mainPosition === position).length,
    limit: laneLimits[position],
  }));
  const filteredApplies = selectedLine
    ? applies.filter((apply) => apply.mainPosition === selectedLine)
    : applies;
  const applyOrder = new Map(applies.map((apply, index) => [apply.id, index + 1]));

  return (
    <main className="page-shell player-detail-page">
      <style>{`
        .destruction-line-filter-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }

        .destruction-line-filter-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 74px;
          padding: 16px;
          border: 1px solid rgba(59, 130, 246, 0.32);
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.58);
          color: inherit;
          text-decoration: none;
          transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
        }

        .destruction-line-filter-card:hover,
        .destruction-line-filter-card--active {
          border-color: rgba(96, 165, 250, 0.78);
          background: rgba(30, 64, 175, 0.24);
          transform: translateY(-1px);
        }

        .destruction-line-filter-card span {
          color: rgba(226, 232, 240, 0.76);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .destruction-line-filter-card strong {
          color: #f8fafc;
          font-size: 22px;
          line-height: 1;
        }


          .destruction-participants-mobile-note {
            display: none;
          }
        .destruction-participants-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .destruction-filter-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .destruction-filter-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 999px;
          color: rgba(226, 232, 240, 0.82);
          background: rgba(15, 23, 42, 0.54);
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
        }

        .destruction-filter-chip--active {
          border-color: rgba(96, 165, 250, 0.76);
          color: #f8fafc;
          background: rgba(37, 99, 235, 0.26);
        }

        .destruction-participant-table-wrap {
          overflow-x: auto;
          border: 1px solid rgba(59, 130, 246, 0.26);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.46);
        }

        .destruction-participant-table {
          width: 100%;
          min-width: 920px;
          border-collapse: collapse;
        }

        .destruction-participant-table th,
        .destruction-participant-table td {
          padding: 14px 12px;
          border-bottom: 1px solid rgba(59, 130, 246, 0.18);
          text-align: left;
          vertical-align: middle;
        }

        .destruction-participant-table th {
          color: rgba(226, 232, 240, 0.68);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.06em;
          background: rgba(2, 6, 23, 0.32);
          white-space: nowrap;
        }

        .destruction-participant-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .destruction-participant-table tbody tr:hover {
          background: rgba(30, 64, 175, 0.16);
        }

        .destruction-participant-order {
          color: rgba(226, 232, 240, 0.66);
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .destruction-participant-name-link {
          display: inline-flex;
          flex-direction: column;
          gap: 3px;
          color: #f8fafc;
          text-decoration: none;
        }

        .destruction-participant-name-link strong {
          font-size: 14px;
          line-height: 1.25;
        }

        .destruction-participant-name-link span {
          color: rgba(203, 213, 225, 0.72);
          font-size: 12px;
        }

        .destruction-position-cell {
          display: flex;
          flex-direction: column;
          gap: 5px;
          white-space: nowrap;
        }

        .destruction-main-position {
          color: #f8fafc;
          font-size: 13px;
          font-weight: 900;
        }

        .destruction-sub-position {
          color: rgba(203, 213, 225, 0.72);
          font-size: 12px;
        }

        .destruction-tier-cell {
          display: flex;
          flex-direction: column;
          gap: 5px;
          white-space: nowrap;
        }

        .destruction-tier-peak {
          color: rgba(203, 213, 225, 0.72);
          font-size: 12px;
        }

        .destruction-badge-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .destruction-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 0 8px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          color: rgba(226, 232, 240, 0.84);
          background: rgba(15, 23, 42, 0.58);
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
        }

        .destruction-badge--captain {
          border-color: rgba(96, 165, 250, 0.55);
          color: #dbeafe;
          background: rgba(37, 99, 235, 0.2);
        }

        .destruction-message-cell {
          max-width: 300px;
          color: rgba(226, 232, 240, 0.82);
          font-size: 12px;
          line-height: 1.5;
        }

        .destruction-message-clamp {
          display: -webkit-box;
          overflow: hidden;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .destruction-date-cell {
          color: rgba(203, 213, 225, 0.7);
          font-size: 12px;
          white-space: nowrap;
        }

        @media (max-width: 860px) {

          .destruction-participants-mobile-note {
            display: block;
            margin: -2px 0 12px;
            padding: 12px 14px;
            border: 1px solid rgba(34, 211, 238, 0.22);
            border-radius: 14px;
            background: rgba(8, 47, 73, 0.2);
            color: rgba(226, 232, 240, 0.82);
            font-size: 12px;
            font-weight: 800;
            line-height: 1.5;
          }

          .player-detail-page .card-grid.player-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .player-detail-page .stat-card {
            min-height: auto;
            padding: 12px;
            border-radius: 14px;
          }

          .player-detail-page .stat-card__label {
            font-size: 11px;
          }

          .player-detail-page .stat-card__value {
            font-size: 20px;
          }

          .player-detail-page .section-subtitle {
            font-size: 12px;
            line-height: 1.45;
          }

          .destruction-filter-chip-row {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            width: 100%;
          }

          .destruction-filter-chip {
            min-height: 38px;
            padding: 0 8px;
          }

          .destruction-line-filter-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }

          .destruction-line-filter-grid .destruction-line-filter-card:first-child {
            grid-column: auto;
          }

          .destruction-line-filter-card {
            min-height: 58px;
            padding: 12px 10px;
            border-radius: 14px;
          }

          .destruction-line-filter-card strong {
            font-size: 18px;
          }

          .destruction-participant-table-wrap {
            overflow-x: visible;
            border: 0;
            background: transparent;
          }

          .destruction-participant-table,
          .destruction-participant-table thead,
          .destruction-participant-table tbody,
          .destruction-participant-table tr,
          .destruction-participant-table th,
          .destruction-participant-table td {
            display: block;
            width: 100%;
            min-width: 0;
          }

          .destruction-participant-table thead {
            display: none;
          }

          .destruction-participant-table tbody {
            display: grid;
            gap: 10px;
          }

          .destruction-participant-table tr {
            padding: 14px;
            border: 1px solid rgba(59, 130, 246, 0.26);
            border-radius: 18px;
            background: rgba(15, 23, 42, 0.58);
          }

          .destruction-participant-table td {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            padding: 9px 0;
            border-bottom: 1px solid rgba(59, 130, 246, 0.14);
            text-align: right;
          }

          .destruction-participant-table td[data-label="순번"],
          .destruction-participant-table td[data-label="각오"],
          .destruction-participant-table td[data-label="신청일"] {
            display: none;
          }

          .destruction-participant-table td:last-child {
            border-bottom: 0;
          }

          .destruction-participant-table td::before {
            content: attr(data-label);
            flex: 0 0 auto;
            color: rgba(148, 163, 184, 0.78);
            font-size: 12px;
            font-weight: 900;
            text-align: left;
          }

          .destruction-participant-name-link,
          .destruction-position-cell,
          .destruction-tier-cell,
          .destruction-badge-row,
          .destruction-message-cell,
          .destruction-date-cell {
            align-items: flex-end;
            text-align: right;
          }

          .destruction-message-cell {
            max-width: 210px;
          }
        }

        @media (max-width: 420px) {
          .destruction-line-filter-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .destruction-filter-chip-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>

      <div className="page-header player-hero">
        <div>
          <p className="page-eyebrow">멸망전 참가자 명단</p>
          <h1 className="page-title">{tournament.title}</h1>
          <p className="page-description">
            라인을 선택하면 해당 주 라인 참가자만 볼 수 있습니다.
          </p>
        </div>

        <div className="page-actions">
          <Link href={`/participation/destruction/${tournament.id}`} className="btn btn-ghost">
            참가 페이지
          </Link>
          <Link href={`/participation/destruction/${tournament.id}/captain-points`} className="btn btn-ghost">
            팀장 포인트표
          </Link>
          <Link href="/participation" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </div>

      <section className="content-section player-panel">
        <div className="card-grid player-stat-grid">
          <article className="stat-card">
            <span className="stat-card__label">확정 후보</span>
            <strong className="stat-card__value">{activeApplies.length}명</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">보류</span>
            <strong className="stat-card__value">{reserveApplies.length}명</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">팀장 선호</span>
            <strong className="stat-card__value">{captainPreferredCount}명</strong>
          </article>
          <article className="stat-card">
            <span className="stat-card__label">총 공개 인원</span>
            <strong className="stat-card__value">{applies.length}명</strong>
          </article>
        </div>
      </section>

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>라인별 현황</h2>
            <p className="section-subtitle">라인을 누르면 아래 명단이 바로 바뀝니다.</p>
          </div>
          {selectedLine ? (
            <Link href={lineHref(tournament.id, null)} className="btn btn-ghost">
              전체 보기
            </Link>
          ) : null}
        </div>
        <div className="destruction-participants-mobile-note">휴대폰에서는 이름, 라인, 티어, 상태만 먼저 표시합니다. 각오와 신청일은 상세 화면에서 확인합니다.</div>
        <div className="destruction-line-filter-grid">
          <Link
            href={lineHref(tournament.id, null)}
            className={`destruction-line-filter-card${!selectedLine ? " destruction-line-filter-card--active" : ""}`}
          >
            <span>ALL</span>
            <strong>{activeApplies.length}명</strong>
          </Link>
          {positionCounts.map((item) => (
            <Link
              key={item.position}
              href={lineHref(tournament.id, item.position)}
              className={`destruction-line-filter-card${selectedLine === item.position ? " destruction-line-filter-card--active" : ""}`}
            >
              <span>{item.position}</span>
              <strong>{item.count}/{item.limit}명</strong>
              {item.reserveCount > 0 ? (
                <small style={{ color: "#fbbf24", fontSize: 11, fontWeight: 800 }}>보류 {item.reserveCount}명</small>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>{selectedLine ? `${selectedLine} 참가자 목록` : "참가자 목록"}</h2>
            <p className="section-subtitle">
              {selectedLine
                ? `${selectedLine} 주 라인 ${filteredApplies.length}명입니다.`
                : `전체 참가자 ${filteredApplies.length}명입니다.`}
            </p>
          </div>
          <div className="destruction-filter-chip-row" aria-label="라인 필터">
            <Link
              href={lineHref(tournament.id, null)}
              className={`destruction-filter-chip${!selectedLine ? " destruction-filter-chip--active" : ""}`}
            >
              전체
            </Link>
            {POSITIONS.map((position) => (
              <Link
                key={position}
                href={lineHref(tournament.id, position)}
                className={`destruction-filter-chip${selectedLine === position ? " destruction-filter-chip--active" : ""}`}
              >
                {position}
              </Link>
            ))}
          </div>
        </div>

        {filteredApplies.length === 0 ? (
          <div className="empty-box">
            {selectedLine ? `${selectedLine} 주 라인 공개 참가자가 없습니다.` : "공개할 참가자가 없습니다."}
          </div>
        ) : (
          <div className="destruction-participant-table-wrap">
            <table className="destruction-participant-table">
              <thead>
                <tr>
                  <th>순번</th>
                  <th>참가자</th>
                  <th>포지션</th>
                  <th>티어</th>
                  <th>신청 상태</th>
                  <th>각오</th>
                  <th>신청일</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplies.map((apply) => {
                  const detailHref = `/participation/destruction/${tournament.id}/participants/${apply.playerId}`;
                  const message = apply.message?.trim() || "각오 미입력";

                  return (
                    <tr key={apply.id}>
                      <td data-label="순번">
                        <span className="destruction-participant-order">#{applyOrder.get(apply.id) ?? "-"}</span>
                      </td>
                      <td data-label="참가자">
                        <Link href={detailHref} className="destruction-participant-name-link">
                          <strong>{apply.player.name}</strong>
                          <span>
                            {apply.player.nickname}#{apply.player.tag}
                          </span>
                        </Link>
                      </td>
                      <td data-label="포지션">
                        <div className="destruction-position-cell">
                          <strong className="destruction-main-position">주 {apply.mainPosition}</strong>
                          <span className="destruction-sub-position">부 {formatPositions(apply.subPositions)}</span>
                        </div>
                      </td>
                      <td data-label="티어">
                        <div className="destruction-tier-cell">
                          <TierIcon tier={apply.player.currentTier} size={24} showText />
                          <span className="destruction-tier-peak">최고 {apply.player.peakTier ?? "-"}</span>
                        </div>
                      </td>
                      <td data-label="신청 상태">
                        <div className="destruction-badge-row">
                          <span className="destruction-badge">{STATUS_LABELS[apply.status] ?? apply.status}</span>
                          <span className={`destruction-badge${apply.isCaptain ? " destruction-badge--captain" : ""}`}>
                            {apply.isCaptain ? "팀장 선호" : "팀장 비선호"}
                          </span>
                        </div>
                      </td>
                      <td data-label="각오">
                        <div className="destruction-message-cell">
                          <span className="destruction-message-clamp">{message}</span>
                        </div>
                      </td>
                      <td data-label="신청일">
                        <span className="destruction-date-cell">{formatDateTime(apply.createdAt)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
