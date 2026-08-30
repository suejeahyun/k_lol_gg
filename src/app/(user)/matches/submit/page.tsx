export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getKstDateKey } from "@/lib/date/kst";
import { prisma } from "@/lib/prisma/client";
import InhouseResultSubmitClient from "./InhouseResultSubmitClient";
import styles from "./page.module.css";

type PageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function InhouseResultSubmitPage({ searchParams }: PageProps) {
  const { code = "" } = await searchParams;
  const codeValue = Array.isArray(code) ? code[0] ?? "" : code;
  const requestedCode = codeValue.trim().toUpperCase();
  const normalizedCode = /^MR[A-F0-9]{10}$/.test(requestedCode) ? requestedCode : "";
  const nextPath = normalizedCode
    ? `/matches/submit?code=${encodeURIComponent(normalizedCode)}`
    : "/matches/submit";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  if (user.status !== "APPROVED") {
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>INHOUSE RESULT</p>
          <h1>내전 결과 제출</h1>
          <p>승인된 계정만 내전 결과 사진을 제출할 수 있습니다.</p>
          <Link className="app-button" href="/account">내 계정 확인</Link>
        </section>
      </main>
    );
  }

  const player = user.playerId
    ? await prisma.player.findUnique({ where: { id: user.playerId }, select: { name: true } })
    : null;
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>INHOUSE RESULT</p>
        <h1>내전 결과 한 번에 제출</h1>
        <p>양식 복사 없이 진행 정보와 2~3장의 결과 사진을 한 화면에서 제출합니다.</p>
      </section>
      <InhouseResultSubmitClient
        defaultDate={getKstDateKey(new Date())}
        defaultOrganizer={player?.name || user.userId}
        initialCode={normalizedCode}
      />
    </main>
  );
}
