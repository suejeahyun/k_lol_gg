export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import Pagination from "@/components/Pagination";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";

const PAGE_SIZE = 12;

type Props = { searchParams: Promise<{ page?: string }> };

function fmt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "-";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function riskClass(level: string | null | undefined) {
  if (level === "HIGH") return "ai-badge ai-badge--high";
  if (level === "MEDIUM") return "ai-badge ai-badge--medium";
  if (level === "LOW") return "ai-badge ai-badge--low";
  return "ai-badge";
}

async function requireAccessOrRedirect(nextPath: string) {
  try {
    await requireApprovedUserOrAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    if (error instanceof Error && error.message === "NOT_APPROVED") {
      redirect("/");
    }
    throw error;
  }
}

export default async function BalanceRecommendationsIndexPage({ searchParams }: Props) {
  await requireAccessOrRedirect("/players/balance/recommendations");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [totalCount, drafts] = await Promise.all([
    prisma.teamBalanceDraft.count(),
    prisma.teamBalanceDraft.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { players: true } },
        balanceReviews: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="page-container ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">PICK · BAN RECOMMENDATIONS</p>
          <h1 className="page-title">밴픽 추천</h1>
          <p className="page-description">
            저장된 팀 밸런스 결과를 선택해 상대 밴 우선순위, 우리 팀 픽 추천, 포지션 페어 호흡, 조합 방향을 확인합니다.
          </p>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href="/players/balance/drafts">저장 밸런스</Link>
            <Link className="button-primary" href="/players/balance">새 팀 밸런스 계산</Link>
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>추천 기준</span><strong>저장안</strong><small>TeamBalanceDraft 기반</small></article>
        <article className="ai-kpi"><span>저장 결과</span><strong>{totalCount}</strong><small>추천 생성 가능</small></article>
        <article className="ai-kpi"><span>현재 페이지</span><strong>{page}</strong><small>전체 {totalPages}페이지</small></article>
        <article className="ai-kpi"><span>표시</span><strong>{drafts.length}</strong><small>최근 저장순</small></article>
        <article className="ai-kpi"><span>데이터</span><strong>내전</strong><small>챔피언·포지션 기록</small></article>
      </section>

      <section className="ai-panel ai-panel--strong">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">사용 흐름</h2>
            <p className="ai-panel__desc">먼저 팀 밸런스를 저장한 뒤, 이 페이지에서 해당 저장안을 선택하면 밴픽 추천 페이지로 이동합니다.</p>
          </div>
        </div>
        <ul className="ai-list">
          <li>밴 추천은 상대 플레이어의 현재 배정 라인 기준 챔피언 기록을 우선합니다.</li>
          <li>픽 추천은 우리 팀 플레이어별 현재 라인 기준 주력 챔피언을 보여줍니다.</li>
          <li>조합 추천은 ADC-SUP, JGL-MID, JGL-TOP, JGL-SUP, JGL-ADC, MID-SUP 페어를 우선 확인합니다.</li>
          <li>챔피언 숙련도는 팀 밸런스 점수를 강하게 바꾸지 않고, 저장된 조합의 밴픽 참고값으로 사용합니다.</li>
        </ul>
      </section>

      <section className="ai-draft-grid">
        {drafts.map((draft) => {
          const review = draft.balanceReviews[0];
          return (
            <article className="ai-panel ai-draft-card" key={draft.id}>
              <div className="ai-panel__head">
                <div>
                  <h2 className="ai-panel__title">{draft.title}</h2>
                  <p className="ai-panel__desc">{formatDate(draft.createdAt)}</p>
                </div>
                <span className={riskClass(review?.aiRiskLevel)}>{review?.aiRiskLevel ?? "NO AI"}</span>
              </div>
              <div className="ai-draft-card__meta">
                <span>선택안: {draft.optionType ?? "-"}</span>
                <span>RED {fmt(draft.redTotal)} / BLUE {fmt(draft.blueTotal)}</span>
                <span>점수 차이 {fmt(draft.diff)} · 밸런스 비용 {fmt(draft.balanceCost)}</span>
                <span>AI 품질 {fmt(review?.qualityScore)} · 플레이어 {draft._count.players}명</span>
              </div>
              <div className="ai-actions ai-actions--push">
                <Link className="button-primary" href={`/players/balance/drafts/${draft.id}/recommendations`}>밴픽 추천 보기</Link>
                <Link className="button-secondary" href={`/players/balance/drafts/${draft.id}`}>밸런스 상세</Link>
              </div>
            </article>
          );
        })}
        {drafts.length === 0 && (
          <article className="ai-panel ai-empty">
            저장된 팀 밸런스가 없습니다. 팀 밸런스 계산 후 저장하면 이곳에서 밴픽 추천을 확인할 수 있습니다.
          </article>
        )}
      </section>

      <Pagination currentPage={page} totalPages={totalPages} basePath="/players/balance/recommendations" />
    </main>
  );
}
