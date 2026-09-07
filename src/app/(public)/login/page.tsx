import type { Metadata } from "next";
import { CloudSun, ShieldCheck, UserRoundCheck } from "lucide-react";

import { UserLoginForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const nextPath = normalizeAccountNext((await searchParams).next);
  return (
    <div className={styles.page}>
      <div className={styles.accessGrid}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}><CloudSun aria-hidden="true" /> ACCOUNT ACCESS</span>
          <h1>내 계정으로<br />가볍게 돌아와요.</h1>
          <p>내 계정 상태를 확인하고 참가 신청과 팀 도구를 이어서 이용해 보세요.</p>
          <div className={styles.promise}><span><strong>상태 확인</strong>가입 승인 상태 안내</span><span><strong>내 정보 관리</strong>플레이어·Riot ID 확인</span><span><strong>안전한 이용</strong>비밀번호 변경 지원</span></div>
        </section>
        <section className={styles.formCard} aria-labelledby="login-title">
          <span className={styles.eyebrow}><UserRoundCheck aria-hidden="true" /> USER LOGIN</span>
          <h1 id="login-title">로그인</h1>
          <p>아이디와 비밀번호를 입력해 주세요.</p>
          <UserLoginForm nextPath={nextPath} />
          <p className={styles.notice}><ShieldCheck aria-hidden="true" /> 관리자 작업은 별도 관리자 로그인과 2단계 인증이 모두 필요합니다.</p>
        </section>
      </div>
    </div>
  );
}
