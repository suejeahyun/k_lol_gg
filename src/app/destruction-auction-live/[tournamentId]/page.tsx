export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import DestructionAuctionManager from "@/components/admin/DestructionAuctionManager";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { applyDestructionRecruitmentAutoReserve } from "@/lib/destruction/recruitment-auto-reserve";
import { prisma } from "@/lib/prisma/client";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export default async function DestructionAuctionLivePage({ params }: PageProps) {
  const admin = await requireAdminRequest();

  if (!admin) {
    redirect("/admin/login");
  }

  const { tournamentId } = await params;
  const id = Number(tournamentId);

  if (Number.isNaN(id)) {
    notFound();
  }

  await applyDestructionRecruitmentAutoReserve(id);

  const tournament = await prisma.destructionTournament.findUnique({
    where: {
      id,
    },
    include: {
      teams: {
        include: {
          captain: true,
          members: {
            include: {
              player: true,
            },
            orderBy: {
              id: "asc",
            },
          },
        },
        orderBy: [
          { points: "desc" },
          { wins: "desc" },
          { losses: "asc" },
          { id: "asc" },
        ],
      },
      participants: {
        include: {
          player: true,
          team: true,
        },
        orderBy: {
          id: "asc",
        },
      },
      participationApplies: {
        select: {
          playerId: true,
          subPositions: true,
          message: true,
        },
      },
      matches: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!tournament) {
    notFound();
  }

  const applicationMetaByPlayerId = new Map(
    tournament.participationApplies.map((apply) => [
      apply.playerId,
      {
        subPositions: apply.subPositions,
        message: apply.message,
      },
    ]),
  );

  const participantViewModels = tournament.participants.map((participant) => {
    const meta = applicationMetaByPlayerId.get(participant.playerId);
    return {
      ...participant,
      subPositions: meta?.subPositions ?? [],
      message: meta?.message ?? null,
    };
  });

  return (
    <main className="destruction-auction-live-page">
      <style>{`
        .destruction-auction-live-page {
          position: fixed;
          inset: 0;
          z-index: 1;
          overflow: auto;
          padding: 28px;
          color: #f8fbff;
          background:
            radial-gradient(circle at 18% 12%, rgba(37, 99, 235, 0.20), transparent 32%),
            radial-gradient(circle at 82% 22%, rgba(14, 165, 233, 0.16), transparent 34%),
            linear-gradient(180deg, #020617 0%, #071125 52%, #020617 100%);
        }

        .destruction-auction-live-shell {
          width: min(1540px, calc(100vw - 56px));
          min-height: calc(100vh - 56px);
          margin: 0 auto;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 18px;
        }

        .destruction-auction-live-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid rgba(59, 130, 246, 0.30);
          border-radius: 22px;
          padding: 18px 20px;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(12, 33, 65, 0.82));
          box-shadow: 0 20px 60px rgba(0,0,0,0.28);
        }

        .destruction-auction-live-title {
          margin: 0;
          font-size: clamp(24px, 2.2vw, 34px);
          line-height: 1.1;
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .destruction-auction-live-desc {
          margin: 8px 0 0;
          color: #a9bdd8;
          font-size: 14px;
          line-height: 1.45;
        }

        .destruction-auction-live-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .destruction-auction-live-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(96, 165, 250, 0.30);
          background: rgba(15, 23, 42, 0.72);
          color: #eaf4ff;
          padding: 0 14px;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }

        .destruction-auction-live-main {
          border: 1px solid rgba(59, 130, 246, 0.30);
          border-radius: 24px;
          padding: 20px;
          background: rgba(8, 17, 34, 0.88);
          box-shadow: 0 28px 80px rgba(0,0,0,0.30);
          min-height: 0;
        }

        .destruction-auction-live-main .destruction-auction-summary {
          margin-bottom: 18px;
        }

        .destruction-auction-live-main .destruction-auction-layout {
          align-items: stretch;
        }

        @media (max-width: 1180px) {
          .destruction-auction-live-page {
            position: static;
            min-height: 100vh;
            padding: 16px;
          }

          .destruction-auction-live-shell {
            width: 100%;
            min-height: auto;
          }

          .destruction-auction-live-header {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <div className="destruction-auction-live-shell">
        <header className="destruction-auction-live-header">
          <div>
            <h1 className="destruction-auction-live-title">{tournament.title}</h1>
            <p className="destruction-auction-live-desc">
              경매 전용 전체화면입니다. 사이드바와 상단 관리자 메뉴 없이 카드 셔플, 카드 공개, 낙찰 입력을 이 화면에서 진행합니다.
            </p>
          </div>

          <div className="destruction-auction-live-actions">
            <Link href={`/admin/progress/destruction/${tournament.id}?step=AUCTION`} className="destruction-auction-live-button">
              관리자 화면으로
            </Link>
          </div>
        </header>

        <section className="destruction-auction-live-main">
          <DestructionAuctionManager
            tournamentId={tournament.id}
            teams={tournament.teams}
            participants={participantViewModels}
            hasMatches={tournament.matches.length > 0}
            liveMode
          />
        </section>
      </div>
    </main>
  );
}
