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
          <p>일반 계정 세션과 관리자 세션을 분리했습니다. 관리자 역할 계정도 이 로그인으로 관리자 권한이 생기지 않습니다.</p>
          <div className={styles.promise}><span><strong>상태 확인</strong>승인 대기·거절·제한 안내</span><span><strong>세션 분리</strong>일반 로그인은 계정 기능만</span><span><strong>안전한 변경</strong>비밀번호 변경 시 전체 로그아웃</span></div>
        </section>
        <section className={styles.formCard} aria-labelledby="login-title">
          <span className={styles.eyebrow}><UserRoundCheck aria-hidden="true" /> USER LOGIN</span>
          <h1 id="login-title">로그인</h1>
          <p>승인 전에도 본인 계정 상태와 비밀번호를 안전하게 관리할 수 있어요.</p>
          <UserLoginForm nextPath={nextPath} />
          <p className={styles.notice}><ShieldCheck aria-hidden="true" /> 관리자 작업은 별도 관리자 로그인과 2단계 인증이 모두 필요합니다.</p>
        </section>
      </div>
    </div>
  );
}
