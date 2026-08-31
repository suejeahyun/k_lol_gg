export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { getKstDateKey } from "@/lib/date/kst";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    AWAITING_UPLOAD: "사진 업로드 대기",
    PENDING_REVIEW: "등록 검토 대기",
    IN_REVIEW: "등록 진행 중",
    REGISTERED: "내전 등록 완료",
    REJECTED: "반려",
  };
  return labels[status] || status;
}

export default async function InhouseResultSubmissionsPage() {
  const submissions = await prisma.inhouseResultSubmission.findMany({
    include: {
      images: {
        include: { privateAsset: true },
        orderBy: { gameNumber: "asc" },
      },
      matchSeries: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="page-eyebrow">INHOUSE RESULT</p>
          <h1>내전 결과 접수</h1>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link className="admin-button" href="/matches/submit">사이트에서 새 결과 제출</Link>
          <Link className="admin-button admin-button--ghost" href="/admin/matches">내전 목록</Link>
        </div>
      </div>
      <section className="admin-card">
        <p>카카오 사진이 수신되지 않은 접수도 <strong>사진 등록</strong>으로 이어 올릴 수 있습니다. 필요한 사진이 모두 등록된 건만 수기 등록을 시작할 수 있습니다.</p>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>접수</th><th>진행 정보</th><th>결과 사진</th><th>상태/다음 작업</th></tr></thead>
            <tbody>
              {submissions.length === 0 ? <tr><td colSpan={4}>접수된 내전 결과가 없습니다.</td></tr> : submissions.map((item) => {
                const imageCount = item.images.length;
                const uploadComplete = imageCount >= item.expectedGameCount;
                const canStartRegistration = uploadComplete && ["PENDING_REVIEW", "IN_REVIEW"].includes(item.status);
                return (
                  <tr key={item.id}>
                    <td><strong>{item.publicCode}</strong><br /><small>{item.organizer}</small></td>
                    <td>{getKstDateKey(item.matchDate)} · {item.seriesNumber}회차<br />{item.expectedGameCount}세트</td>
                    <td>
                      <strong>{imageCount}/{item.expectedGameCount}장</strong><br />
                      {item.images.map((image) => <Link key={image.id} className="admin-button admin-button--ghost" href={`/admin/private-assets/${image.privateAssetId}`}>{image.gameNumber}세트</Link>)}
                    </td>
                    <td>
                      {item.matchSeries ? <Link href={`/admin/matches/${item.matchSeries.id}/edit`}>{item.matchSeries.title}</Link> : canStartRegistration ? <Link className="admin-button" href={`/admin/matches/new?submissionId=${item.id}`}>수기 등록 시작</Link> : item.status === "AWAITING_UPLOAD" ? <Link className="admin-button" href={`/matches/submit?code=${item.publicCode}`}>사진 등록</Link> : null}
                      <br /><small>{statusLabel(item.status)}{!uploadComplete ? ` · ${item.expectedGameCount - imageCount}장 남음` : ""}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
