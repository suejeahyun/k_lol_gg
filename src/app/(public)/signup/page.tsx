import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import { Sparkles, UserPlus } from "@/components/theme/theme-icons";

import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";
import { SignupForm } from "@/components/accounts/account-auth-forms";
import { SiteFeatureStatePanel } from "@/components/site-feature-state";
import { readSiteFeatureState, siteFeatureLabel } from "@/modules/operations/infrastructure/site-feature-access";
import styles from "@/components/accounts/account-access.module.css";

export const metadata = createRouteMetadata("/signup");

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const nextPath = normalizeAccountNext((await searchParams).next, "/");
  const featureState = await readSiteFeatureState("registrations");
  if (featureState !== "enabled") {
    return <div className={styles.page}><SiteFeatureStatePanel label={siteFeatureLabel("registrations")} state={featureState} /></div>;
  }
  return (
    <div className={styles.page}><div className={styles.accessGrid}>
      <section className={styles.formCard} aria-labelledby="signup-title">
        <span className={styles.eyebrow}><UserPlus aria-hidden="true" /> SIGNUP REQUEST</span>
        <h1 id="signup-title">회원가입</h1><p>신규 플레이어는 가입 즉시 승인되며 바로 로그인할 수 있습니다.</p><SignupForm nextPath={nextPath} />
      </section>
      <section className={styles.intro}>
        <span className={styles.eyebrow}><Sparkles aria-hidden="true" /> JOIN K-LOL.GG</span>
        <h2>내전 놀이터에<br />함께할 준비.</h2>
        <p>기본 정보와 새 Riot ID를 입력하면 가입과 승인이 바로 완료됩니다.</p>
        <div className={styles.promise}><span><strong>바로 시작</strong>신규 플레이어는 자동 승인</span><span><strong>안전한 연결</strong>기존 플레이어는 관리자 확인</span><span><strong>개인정보 보호</strong>회원명은 운영 목적으로만 사용</span></div>
      </section>
    </div></div>
  );
}
