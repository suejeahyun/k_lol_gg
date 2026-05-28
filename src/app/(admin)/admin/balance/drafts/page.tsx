export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

function formatDate(value: Date) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

export default async function AdminTeamBalanceDraftsPage() {
  const drafts = await prisma.teamBalanceDraft.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    include: {
      season: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          players: true,
          balanceReviews: true,
        },
      },
    },
  });

  return (
    <main className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <p className="page-kicker">ADMIN · TEAM BALANCE</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>저장된 팀 밸런스</h1>
          <p className="page-description" style={{ margin: 0 }}>
            관리자 기준으로 저장된 팀 밸런스 결과를 확인하고 내전 등록에 사용할 수 있습니다.
          </p>
        </div>

        <Link className="button button--primary" href="/admin/balance">
          새 팀 밸런스 계산
        </Link>
      </div>

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>제목</th>
                <th>시즌</th>
                <th>안</th>
                <th>RED</th>
                <th>BLUE</th>
                <th>차이</th>
                <th>인원</th>
                <th>AI 리뷰</th>
                <th>생성일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: 28 }}>
                    저장된 팀 밸런스 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>#{draft.id}</td>
                    <td>{draft.title}</td>
                    <td>{draft.season?.name ?? "-"}</td>
                    <td>{draft.optionType ?? "-"}</td>
                    <td>{formatNumber(draft.redTotal)}</td>
                    <td>{formatNumber(draft.blueTotal)}</td>
                    <td>{formatNumber(draft.diff)}</td>
                    <td>{draft._count.players}명</td>
                    <td>{draft._count.balanceReviews}개</td>
                    <td>{formatDate(draft.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Link className="button button--sm" href={`/players/balance/drafts/${draft.id}/recommendations`}>추천</Link>
                        <Link className="button button--sm" href={`/admin/balance/drafts/${draft.id}`}>상세</Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
