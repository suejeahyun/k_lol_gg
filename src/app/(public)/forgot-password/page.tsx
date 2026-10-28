import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { PasswordRecoveryForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { managedCommunitySsoRuntime } from "@/modules/auth/infrastructure/runtime-community-sso";

export const metadata = createRouteMetadata("/forgot-password");

export default function ForgotPasswordPage() {
  const PageContainer = SERVICE_BRAND.id === "hub" || SERVICE_BRAND.id === "community" ? "main" : "div";
  let hubOrigin: string | null = null;
  if (SERVICE_BRAND.id === "community") {
    try { hubOrigin = managedCommunitySsoRuntime().hubOrigin; } catch { /* Local account recovery remains available. */ }
  }
  return (
    <PageContainer className={styles.page}><div className={styles.accessGrid}>
      <section className={styles.formCard} aria-labelledby="recovery-title"><h1 id="recovery-title">비밀번호 복구 요청</h1>{hubOrigin ? <p>GG HUB로 가입했다면 <a href={`${hubOrigin}/forgot-password`}>GG HUB 계정 복구</a>를 이용해 주세요. 아래는 이 사이트에서 만든 아이디·비밀번호 계정의 복구 요청입니다.</p> : null}<p>관리자 확인 후 임시 비밀번호가 전달됩니다.</p><PasswordRecoveryForm /></section>
    </div></PageContainer>
  );
}
