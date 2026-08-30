export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentDisciplineEvidenceCount } from "@/lib/discipline/evidence-batch";
import { disciplineRecordOwnerWhere } from "@/lib/discipline/ownership";
import { getKstDateKey } from "@/lib/date/kst";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "계정 정보",
  robots: { index: false, follow: false },
};

const DISCIPLINE_LABELS: Record<string, string> = {
  CAUTION: "주의",
  WARNING: "경고",
  BAN: "벤/강퇴",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  REQUIRED: "사진 제출 필요",
  AWAITING_UPLOAD: "사진 제출 중",
  REJECTED: "보완 제출 필요",
  PENDING_REVIEW: "관리자 검토 대기",
  APPROVED: "차감 승인",
};

const UPLOADABLE_TASK_STATUSES = new Set(["REQUIRED", "AWAITING_UPLOAD", "REJECTED"]);

export default async function AccountPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/account");

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userAccountId },
    include: {
      player: true,
    },
  });
  if (!user) redirect("/login?next=/account");

  const disciplineRecords = await prisma.userDisciplineRecord.findMany({
    where: {
      isActive: true,
      type: { in: ["CAUTION", "WARNING", "BAN"] },
      ...disciplineRecordOwnerWhere({
        userAccountId: user.id,
        playerId: user.player?.id ?? null,
      }),
    },
    select: {
      id: true,
      type: true,
      reason: true,
      createdAt: true,
      resolutionTask: {
        select: {
          publicCode: true,
          category: true,
          requiredGameCount: true,
          dueAt: true,
          status: true,
          reviewedAt: true,
          reviewNote: true,
          evidence: { select: { submittedAt: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const disciplineSummary = disciplineRecords.reduce(
    (summary, record) => {
      if (record.type === "CAUTION") summary.cautions += 1;
      if (record.type === "WARNING") summary.warnings += 1;
      if (record.type === "BAN") summary.bans += 1;
      return summary;
    },
    { cautions: 0, warnings: 0, bans: 0 },
  );
  const now = new Date();

  return (
    <main className="user-page account-page account-page--compact">
      <div className="user-page__header account-page__header">
        <div>
          <h1 className="user-page__title">내 정보</h1>
        </div>
      </div>

      <section className="admin-card account-card account-summary-card">
        <div className="admin-section-head">
          <div>
            <h2>계정 정보</h2>
            <p className="admin-muted">아이디 {user.userId} · 상태 {user.status} · 권한 {user.role}</p>
          </div>
        </div>

        <div className="account-info-grid">
          <div>
            <span>플레이어</span>
            <strong>{user.player ? `${user.player.name} / ${user.player.nickname}#${user.player.tag}` : "미연결"}</strong>
          </div>
          <div>
            <span>현재 티어</span>
            <strong>{user.player?.currentTier || "-"}</strong>
          </div>
          <div>
            <span>최고 티어</span>
            <strong>{user.player?.peakTier || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="admin-card account-card account-discipline-card" aria-labelledby="account-discipline-title">
        <div className="admin-section-head account-discipline-head">
          <div>
            <h2 id="account-discipline-title">내 경고 현황</h2>
            <p className="admin-muted">내 계정과 연결된 플레이어의 활성 주의·경고·벤 기록입니다.</p>
          </div>
          <Link className="admin-button" href="/discipline">전체 징계 통계</Link>
        </div>

        <div className="account-discipline-summary" role="group" aria-label="내 활성 징계 요약">
          <div className={disciplineSummary.cautions > 0 ? "has-caution" : ""}>
            <span>주의</span>
            <strong>{disciplineSummary.cautions}회</strong>
          </div>
          <div className={disciplineSummary.warnings > 0 ? "has-warning" : ""}>
            <span>경고</span>
            <strong>{disciplineSummary.warnings}회</strong>
          </div>
          <div className={disciplineSummary.bans > 0 ? "has-ban" : ""}>
            <span>벤/강퇴</span>
            <strong>{disciplineSummary.bans > 0 ? `${disciplineSummary.bans}건` : "해당 없음"}</strong>
          </div>
        </div>

        {disciplineRecords.length === 0 ? (
          <p className="account-discipline-empty">현재 활성 상태인 주의·경고·벤 기록이 없습니다.</p>
        ) : (
          <ul className="account-discipline-list">
            {disciplineRecords.map((record) => {
              const task = record.resolutionTask;
              const receivedImageCount = task
                ? currentDisciplineEvidenceCount(task.evidence, task.reviewedAt)
                : 0;
              const hasPendingUpload = Boolean(
                task
                && UPLOADABLE_TASK_STATUSES.has(task.status)
                && receivedImageCount < task.requiredGameCount,
              );
              const isExpired = Boolean(task && hasPendingUpload && task.dueAt <= now);
              const canUpload = Boolean(
                task
                && user.status === "APPROVED"
                && !isExpired
                && hasPendingUpload,
              );

              return (
                <li className="account-discipline-item" key={record.id}>
                  <div className="account-discipline-item__main">
                    <span className={`account-discipline-type account-discipline-type--${record.type.toLowerCase()}`}>
                      {DISCIPLINE_LABELS[record.type] ?? record.type}
                    </span>
                    <div>
                      <strong>{record.reason}</strong>
                      <span>등록일 {getKstDateKey(record.createdAt)}</span>
                    </div>
                  </div>
                  {task ? (
                    <div className="account-discipline-task">
                      <div>
                        <strong>{TASK_STATUS_LABELS[task.status] ?? task.status}</strong>
                        <span>
                          {task.publicCode} · {task.category === "INHOUSE" ? "내전" : "일반"} · 사진 {receivedImageCount}/{task.requiredGameCount}장 · 기한 {getKstDateKey(task.dueAt)}
                        </span>
                        {task.status === "REJECTED" && task.reviewNote ? (
                          <span className="account-discipline-task__review" role="alert">반려 사유: {task.reviewNote}</span>
                        ) : null}
                        {isExpired ? (
                          <span className="account-discipline-task__review">제출 기한이 지났습니다. 관리자에게 문의해주세요.</span>
                        ) : null}
                      </div>
                      {canUpload ? (
                        <Link
                          className="admin-button account-discipline-upload"
                          href={`/discipline/evidence?code=${encodeURIComponent(task.publicCode)}`}
                        >
                          사진 등록
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="account-action-grid" aria-label="내정보 수정 메뉴">
        <Link className="account-action-card" href="/account/tier">
          <span className="account-action-card__eyebrow">PLAYER</span>
          <strong>플레이어 정보</strong>
          <span className="account-action-card__cta">관리하기</span>
        </Link>

        <Link className="account-action-card" href="/me/riot">
          <span className="account-action-card__eyebrow">RIOT</span>
          <strong>Riot 계정 연동</strong>
          <span className="account-action-card__cta">확인하기</span>
        </Link>

        <Link className="account-action-card" href="/account/password">
          <span className="account-action-card__eyebrow">SECURITY</span>
          <strong>비밀번호 변경</strong>
          <span className="account-action-card__cta">변경하기</span>
        </Link>
      </section>
    </main>
  );
}
