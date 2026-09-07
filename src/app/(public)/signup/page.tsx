import type { Metadata } from "next";
import { Sparkles, UserPlus } from "lucide-react";

import { SignupForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";

export const metadata: Metadata = { title: "가입 신청" };

export default function SignupPage() {
  return (
    <div className={styles.page}><div className={styles.accessGrid}>
      <section className={styles.intro}>
        <span className={styles.eyebrow}><Sparkles aria-hidden="true" /> JOIN K-LOL.GG</span>
        <h1>내전 놀이터에<br />함께할 준비.</h1>
        <p>신규 Riot ID는 승인 대기 계정과 새 플레이어로 등록합니다. 기존 플레이어와 일치하면 소유권을 추정하지 않고 관리자 수동 검토를 기다립니다.</p>
        <div className={styles.promise}><span><strong>검토 우선</strong>기존 플레이어 즉시 탈취 방지</span><span><strong>개인정보 경계</strong>회원명은 관리자 업무로 제한</span><span><strong>승인 전 제한</strong>계정 관리만 허용</span></div>
      </section>
      <section className={styles.formCard} aria-labelledby="signup-title">
        <span className={styles.eyebrow}><UserPlus aria-hidden="true" /> SIGNUP REQUEST</span>
        <h1 id="signup-title">가입 신청</h1><p>입력 정보를 확인한 뒤 관리자 승인 절차가 시작됩니다.</p><SignupForm />
      </section>
    </div></div>
  );
}
