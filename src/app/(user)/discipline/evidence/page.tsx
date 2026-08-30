export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getKstDateKey } from "@/lib/date/kst";
import { prisma } from "@/lib/prisma/client";
import DisciplineEvidenceSubmitClient from "./DisciplineEvidenceSubmitClient";
import styles from "./page.module.css";
import { currentDisciplineEvidenceCount } from "@/lib/discipline/evidence-batch";
import { disciplineRecordOwnerWhere } from "@/lib/discipline/ownership";

type PageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function DisciplineEvidencePage({ searchParams }: PageProps) {
  const { code: rawCode = "" } = await searchParams;
  const codeValue = Array.isArray(rawCode) ? rawCode[0] ?? "" : rawCode;
  const requestedCode = codeValue.trim().toUpperCase();
  const safeCode = /^WR[A-F0-9]{10}$/.test(requestedCode) ? requestedCode : "";
  const user = await getCurrentUser();
  if (!user) {
    const nextPath = safeCode
      ? `/discipline/evidence?code=${encodeURIComponent(safeCode)}`
      : "/discipline/evidence";
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (user.status !== "APPROVED") {
    return <main className={styles.page}><h1>경고 차감 사진 제출</h1><p>승인된 계정만 사용할 수 있습니다.</p><Link className="app-button" href="/account">내 계정 확인</Link></main>;
  }

  const now = new Date();
  const activeStatusWhere: Prisma.DisciplineResolutionTaskWhereInput = {
    OR: [
      { status: "PENDING_REVIEW" },
      {
        status: { in: ["REQUIRED", "REJECTED", "AWAITING_UPLOAD"] },
        dueAt: { gt: now },
      },
    ],
  };
  const include = {
    disciplineRecord: { select: { reason: true } },
    evidence: { select: { submittedAt: true } },
  } satisfies Prisma.DisciplineResolutionTaskInclude;
  const [listedTasks, requestedTask] = await Promise.all([
    prisma.disciplineResolutionTask.findMany({
      where: {
        ...activeStatusWhere,
        disciplineRecord: disciplineRecordOwnerWhere(user),
      },
      include,
      orderBy: { dueAt: "asc" },
      take: 20,
    }),
    safeCode
      ? prisma.disciplineResolutionTask.findFirst({
        where: {
          publicCode: safeCode,
          ...activeStatusWhere,
          disciplineRecord: disciplineRecordOwnerWhere(user),
        },
        include,
      })
      : null,
  ]);
  const tasks = requestedTask && !listedTasks.some((task) => task.id === requestedTask.id)
    ? [requestedTask, ...listedTasks.slice(0, 19)]
    : listedTasks;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>DISCIPLINE EVIDENCE</p>
        <h1>경고 차감 사진 한 번에 제출</h1>
        <span>내 계정에 연결된 과제만 확인하고, 남은 게임 사진을 한 번에 선택해 제출할 수 있습니다.</span>
      </header>
      <DisciplineEvidenceSubmitClient initialCode={safeCode} tasks={tasks.map((task) => ({
        publicCode: task.publicCode,
        category: task.category,
        reason: task.disciplineRecord.reason,
        issuedDate: getKstDateKey(task.issuedAt),
        status: task.status,
        requiredGameCount: task.requiredGameCount,
        receivedImageCount: currentDisciplineEvidenceCount(task.evidence, task.reviewedAt),
        dueDate: getKstDateKey(task.dueAt),
        reviewNote: task.status === "REJECTED" ? task.reviewNote : null,
      }))} />
    </main>
  );
}
