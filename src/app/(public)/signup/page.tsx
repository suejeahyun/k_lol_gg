import type { Metadata } from "next";
import { Sparkles, UserPlus } from "lucide-react";

import { SignupForm } from "@/components/accounts/account-auth-forms";
import { SiteFeatureStatePanel } from "@/components/site-feature-state";
import { readSiteFeatureState, siteFeatureLabel } from "@/modules/operations/infrastructure/site-feature-access";
import styles from "@/components/accounts/account-access.module.css";

export const metadata: Metadata = { title: "가입 신청" };

export default async function SignupPage() {
  const featureState = await readSiteFeatureState("registrations");
  if (featureState !== "enabled") {
    return <div className={styles.page}><SiteFeatureStatePanel label={siteFeatureLabel("registrations")} state={featureState} /></div>;
  }
  return (
    <div className={styles.page}><div className={styles.accessGrid}>
      <section className={styles.intro}>
        <span className={styles.eyebrow}><Sparkles aria-hidden="true" /> JOIN K-LOL.GG</span>
        <h1>내전 놀이터에<br />함께할 준비.</h1>
        <p>기본 정보와 Riot ID를 입력하면 관리자가 확인 후 가입을 승인합니다.</p>
        <div className={styles.promise}><span><strong>안전한 연결</strong>기존 플레이어는 관리자 확인</span><span><strong>개인정보 보호</strong>회원명은 운영 목적으로만 사용</span><span><strong>승인 안내</strong>내 계정에서 진행 상태 확인</span></div>
      </section>
      <section className={styles.formCard} aria-labelledby="signup-title">
        <span className={styles.eyebrow}><UserPlus aria-hidden="true" /> SIGNUP REQUEST</span>
        <h1 id="signup-title">가입 신청</h1><p>입력 정보를 확인한 뒤 관리자 승인 절차가 시작됩니다.</p><SignupForm />
      </section>
    </div></div>
  );
}
