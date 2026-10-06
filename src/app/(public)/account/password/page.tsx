import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";

import { AccountPasswordForm } from "@/components/accounts/account-password-form";
import styles from "@/components/accounts/account-access.module.css";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requireAccountPage } from "@/modules/auth/infrastructure/server-authorization";

export const metadata = createRouteMetadata("/account/password");
export const dynamic = "force-dynamic";

export default async function AccountPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = normalizeAccountNext((await searchParams).next);
  const session = await requireAccountPage(`/account/password?next=${encodeURIComponent(next)}`);
  const repository = getRuntimeAccountRepository();
  const account = repository ? await repository.findSelf(session.userId).catch(() => null) : null;
  return <div className={styles.page}><div className={styles.accessGrid}>
    <section className={styles.formCard} aria-labelledby="password-title"><h1 id="password-title">비밀번호 변경</h1>{account ? <AccountPasswordForm revision={account.revision} nextPath={next} /> : <div className={styles.message} data-tone="error" role="alert">계정 정보를 불러오지 못했습니다.</div>}<div className={styles.links}><Link href="/account">계정으로 돌아가기</Link></div></section>
  </div></div>;
}
