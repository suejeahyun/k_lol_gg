import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DESTRUCTION_CAPTAIN_BASE_POINT,
  DESTRUCTION_CAPTAIN_LANES,
  getDestructionCaptainPointTableRows,
} from "@/lib/destruction/captain-points";
import { prisma } from "@/lib/prisma/client";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

const LANE_LABELS: Record<(typeof DESTRUCTION_CAPTAIN_LANES)[number], string> = {
  TOP: "탑",
  JGL: "정글",
  MID: "미드",
  ADC: "원딜",
  SUP: "서포터",
};

export default async function DestructionCaptainPointTablePage({ params }: PageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const tournament = await prisma.destructionTournament.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
    },
  });

  if (!tournament) {
    notFound();
  }

  const rows = getDestructionCaptainPointTableRows();

  return (
    <main className="page-shell player-detail-page">
      <style>{`
        .destruction-point-guide {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .destruction-point-guide-card {
          min-height: 92px;
          padding: 16px;
          border: 1px solid rgba(59, 130, 246, 0.28);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.58);
        }

        .destruction-point-guide-card span {
          display: block;
          margin-bottom: 8px;
          color: rgba(203, 213, 225, 0.72);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .destruction-point-guide-card strong {
          color: #f8fafc;
          font-size: 20px;
          line-height: 1.25;
        }

        .destruction-point-guide-card p {
          margin: 8px 0 0;
          color: rgba(226, 232, 240, 0.72);
          font-size: 12px;
          line-height: 1.5;
        }

        .destruction-point-table-wrap {
          overflow-x: auto;
          border: 1px solid rgba(59, 130, 246, 0.26);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.5);
        }

        .destruction-point-table {
          width: 100%;
          min-width: 980px;
          border-collapse: collapse;
        }

        .destruction-point-table th,
        .destruction-point-table td {
          padding: 12px 10px;
          border-bottom: 1px solid rgba(59, 130, 246, 0.16);
          text-align: right;
          vertical-align: middle;
          white-space: nowrap;
        }

        .destruction-point-table th:first-child,
        .destruction-point-table td:first-child {
          position: sticky;
          left: 0;
          z-index: 1;
          min-width: 170px;
          text-align: left;
          background: rgba(7, 16, 35, 0.96);
        }

        .destruction-point-table th {
          color: rgba(226, 232, 240, 0.76);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.04em;
          background: rgba(2, 6, 23, 0.4);
        }

        .destruction-point-table tbody tr:hover td {
          background: rgba(30, 64, 175, 0.16);
        }

        .destruction-point-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .destruction-point-tier {
          color: #f8fafc;
          font-weight: 900;
        }

        .destruction-point-value {
          color: rgba(226, 232, 240, 0.78);
          font-size: 12px;
        }

        .destruction-point-result {
          color: #f8fafc;
          font-size: 13px;
          font-weight: 900;
        }

        .destruction-point-cell {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
        }

        @media (max-width: 860px) {
          .destruction-point-guide {
            grid-template-columns: 1fr;
          }

          .destruction-point-guide-card {
            min-height: auto;
            padding: 14px;
          }

          .destruction-point-guide-card strong {
            font-size: 17px;
          }
        }
      `}</style>

      <div className="page-header player-hero">
        <div>
          <p className="page-eyebrow">멸망전 팀장 포인트표</p>
          <h1 className="page-title">{tournament.title}</h1>
          <p className="page-description">
            팀장 지급 포인트는 기본 {DESTRUCTION_CAPTAIN_BASE_POINT}점에서 티어·라인 기준값의 10배를 차감한 뒤 10단위로 반올림해 계산합니다.
          </p>
        </div>

        <div className="page-actions">
          <Link href={`/participation/destruction/${tournament.id}`} className="btn btn-ghost">
            참가 페이지
          </Link>
          <Link href={`/participation/destruction/${tournament.id}/participants`} className="btn btn-ghost">
            참가자 명단
          </Link>
        </div>
      </div>

      <section className="content-section player-panel">
        <div className="destruction-point-guide">
          <article className="destruction-point-guide-card">
            <span>계산식</span>
            <strong>10단위 반올림(2000 - 기준값 × 10)</strong>
            <p>최종 점수는 1단위가 아니라 10단위로 반올림해 적용합니다.</p>
          </article>
          <article className="destruction-point-guide-card">
            <span>예외 기준</span>
            <strong>실버3 이하 서포터 1850점</strong>
            <p>표 기준값 15 적용: 2000 - 150 = 1850점입니다.</p>
          </article>
          <article className="destruction-point-guide-card">
            <span>표시 방식</span>
            <strong>최종 지급 포인트만 표시</strong>
            <p>유저 화면에서는 기준값을 숨기고 실제 지급되는 점수만 보여줍니다.</p>
          </article>
        </div>
      </section>

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>티어·라인별 지급 포인트</h2>
            <p className="section-subtitle">휴대폰에서는 표를 좌우로 밀어 전체 라인을 확인할 수 있습니다.</p>
          </div>
        </div>

        <div className="destruction-point-table-wrap">
          <table className="destruction-point-table">
            <thead>
              <tr>
                <th>티어</th>
                {DESTRUCTION_CAPTAIN_LANES.map((lane) => (
                  <th key={lane}>{LANE_LABELS[lane]} 지급</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tierKey}>
                  <td className="destruction-point-tier">{row.tierLabel}</td>
                  {DESTRUCTION_CAPTAIN_LANES.map((lane) => (
                    <td key={lane}>
                      <strong className="destruction-point-result">{row.auctionPoints[lane]}점</strong>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
