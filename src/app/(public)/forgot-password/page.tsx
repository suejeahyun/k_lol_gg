import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { PasswordRecoveryForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";

export const metadata = createRouteMetadata("/forgot-password");

export default function ForgotPasswordPage() {
  return (
    <div className={styles.page}><div className={styles.accessGrid}>
      <section className={styles.formCard} aria-labelledby="recovery-title"><h1 id="recovery-title">비밀번호 복구 요청</h1><p>관리자 확인 후 임시 비밀번호가 전달됩니다.</p><PasswordRecoveryForm /></section>
    </div></div>
  );
}
