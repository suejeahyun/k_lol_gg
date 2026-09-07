import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { AccountPasswordForm } from "@/components/accounts/account-password-form";
import styles from "@/components/accounts/account-access.module.css";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requireAccountPage } from "@/modules/auth/infrastructure/server-authorization";

export const metadata: Metadata = { title: "비밀번호 변경" };
export const dynamic = "force-dynamic";

export default async function AccountPasswordPage() {
  const session = await requireAccountPage("/account/password");
  const repository = getRuntimeAccountRepository();
  const account = repository ? await repository.findSelf(session.userId).catch(() => null) : null;
  return <div className={styles.page}><div className={styles.accessGrid}>
    <section className={styles.intro}><span className={styles.eyebrow}><KeyRound aria-hidden="true" /> PASSWORD SECURITY</span><h1>새 비밀번호로<br />안전하게 바꿔요.</h1><p>승인 상태와 관계없이 본인 비밀번호를 변경할 수 있습니다. 변경은 계정 revision, 감사 기록, 전체 세션 종료와 한 트랜잭션으로 처리됩니다.</p></section>
    <section className={styles.formCard} aria-labelledby="password-title"><h1 id="password-title">비밀번호 변경</h1>{account ? <AccountPasswordForm revision={account.revision} /> : <div className={styles.message} data-tone="error" role="alert">계정 정보를 불러오지 못했습니다.</div>}<div className={styles.links}><Link href="/account">계정으로 돌아가기</Link></div></section>
  </div></div>;
}
