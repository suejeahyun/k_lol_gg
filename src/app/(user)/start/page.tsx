export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "등록·제출 시작",
  description: "내전 결과, 경고 차감 사진, 관리자 경고 등록을 안내에 따라 시작합니다.",
  robots: { index: false, follow: false },
};

type GuideCardProps = {
  number: string;
  badge: string;
  title: string;
  description: string;
  steps: string[];
  href: string;
  action: string;
  tone: "match" | "evidence" | "warning";
  recommended?: boolean;
};

function GuideCard({
  number,
  badge,
  title,
  description,
  steps,
  href,
  action,
  tone,
  recommended = false,
}: GuideCardProps) {
  return (
    <article className={`${styles.guideCard} ${styles[tone]}`}>
      <div className={styles.cardTopline}>
        <span className={styles.cardNumber} aria-hidden="true">{number}</span>
        <span className={styles.cardBadge}>{badge}</span>
        {recommended ? <span className={styles.recommended}>가장 많이 사용</span> : null}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <ol className={styles.cardSteps}>
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <Link className={styles.cardAction} href={href}>{action}<span aria-hidden="true">→</span></Link>
    </article>
  );
}

export default async function RegistrationStartPage() {
  const user = await getCurrentUser();
  const isApproved = user?.status === "APPROVED";
  const isAdmin = isApproved && (user.role === "ADMIN" || user.role === "SUPER_ADMIN");

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>K-LOL.GG GUIDED START</span>
          <h1>무엇을 등록하려고 하나요?</h1>
          <p>처음 사용해도 괜찮습니다. 목적을 고르면 필요한 정보만 순서대로 안내합니다.</p>
        </div>
        <div className={styles.sessionCard}>
          <span>현재 상태</span>
          <strong>{user ? `${user.userId}님` : "로그인 전"}</strong>
          <p>
            {!user
              ? "로그인하면 이름과 날짜를 자동으로 채울 수 있습니다."
              : !isApproved
                ? "계정 승인 후 사진과 결과를 제출할 수 있습니다."
                : isAdmin
                  ? "내전 제출과 관리자 경고 등록을 모두 사용할 수 있습니다."
                  : "내전 결과와 본인 경고 사진을 제출할 수 있습니다."}
          </p>
          {!user ? <Link href="/login?next=%2Fstart">로그인하고 시작</Link> : <Link href="/account">내 진행 상황 보기</Link>}
        </div>
      </section>

      <section className={styles.choiceSection} aria-labelledby="registration-choice-title">
        <div className={styles.sectionHeading}>
          <span>한 가지만 선택하세요</span>
          <h2 id="registration-choice-title">목적별 빠른 시작</h2>
        </div>
        <div className={styles.cardGrid}>
          <GuideCard
            number="01"
            badge="내전 진행자"
            title="내전 결과 제출"
            description="날짜와 진행자는 자동으로 채우고, 결과 사진을 한 번에 올립니다."
            steps={["2세트 또는 3세트 선택", "결과 사진 순서 확인", "제출 상태 바로 확인"]}
            href="/matches/submit"
            action={isApproved ? "내전 결과 시작" : "로그인 후 시작"}
            tone="match"
            recommended
          />
          <GuideCard
            number="02"
            badge="경고 받은 사용자"
            title="경고 차감 사진 제출"
            description="내 과제를 자동으로 확인하고, 준비된 사진부터 나누어 제출할 수 있습니다."
            steps={["내 경고 과제 선택", "사진 여러 장 선택", "남은 장수 바로 확인"]}
            href="/discipline/evidence"
            action={isApproved ? "내 경고 사진 제출" : "로그인 후 확인"}
            tone="evidence"
          />
          <GuideCard
            number="03"
            badge="관리자 전용"
            title="주의·경고 등록"
            description="대상을 찾고 종류와 사유를 고른 뒤, 최종 요약을 확인하고 등록합니다."
            steps={["대상 검색 또는 직접 입력", "주의·일반 경고·내전 경고 선택", "대상자에게 제출 링크 안내"]}
            href="/admin/discipline/new"
            action={isAdmin ? "관리자 경고 등록" : "관리자 로그인"}
            tone="warning"
          />
        </div>
      </section>

      <section className={styles.helpSection}>
        <div>
          <span className={styles.helpIcon} aria-hidden="true">?</span>
          <div>
            <h2>진행 중인 제출이 있나요?</h2>
            <p>로그인하면 본인의 미완료 내전 결과와 경고 사진 과제를 자동으로 찾아 이어서 할 수 있습니다.</p>
          </div>
        </div>
        <div className={styles.helpActions}>
          <Link href="/matches/submit">내전 결과 이어서 제출</Link>
          <Link href="/discipline/evidence">경고 사진 이어서 제출</Link>
        </div>
      </section>

      <section className={styles.beginnerNote} aria-label="처음 사용하는 분 안내">
        <strong>처음 사용하는 분께</strong>
        <p>카카오 양식을 복사할 필요가 없습니다. 이 화면에서 목적을 선택하고, 각 단계의 파란색 다음 버튼만 따라가면 됩니다.</p>
      </section>
    </main>
  );
}
