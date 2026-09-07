import type { Metadata } from "next";
import { KeyRound, LockKeyhole } from "lucide-react";

import { PasswordRecoveryForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";

export const metadata: Metadata = { title: "비밀번호 도움" };

export default function ForgotPasswordPage() {
  return (
    <div className={styles.page}><div className={styles.accessGrid}>
      <section className={styles.intro}><span className={styles.eyebrow}><LockKeyhole aria-hidden="true" /> ACCOUNT RECOVERY</span><h1>다시 들어갈 길을<br />안전하게 열어요.</h1><p>요청이 접수되면 관리자가 확인한 뒤 임시 비밀번호를 안전하게 전달합니다.</p></section>
      <section className={styles.formCard} aria-labelledby="recovery-title"><span className={styles.eyebrow}><KeyRound aria-hidden="true" /> RESET REQUEST</span><h1 id="recovery-title">비밀번호 도움</h1><p>기억나는 로그인 아이디를 입력해 주세요.</p><PasswordRecoveryForm /></section>
    </div></div>
  );
}
