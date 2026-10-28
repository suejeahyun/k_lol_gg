import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";

import { AccountPasswordForm } from "@/components/accounts/account-password-form";
import styles from "@/components/accounts/account-access.module.css";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requireAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { communitySsoRepository, managedCommunitySsoRuntime } from "@/modules/auth/infrastructure/runtime-community-sso";

export const metadata = createRouteMetadata("/account/password");
export const dynamic = "force-dynamic";

export default async function AccountPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = normalizeAccountNext((await searchParams).next);
  const session = await requireAccountPage(`/account/password?next=${encodeURIComponent(next)}`);
  const repository = getRuntimeAccountRepository();
  const account = repository ? await repository.findSelf(session.userId).catch(() => null) : null;
  if (SERVICE_BRAND.id === "community" && account && await communitySsoRepository().usesHubPassword(session.userId)) {
    const hubOrigin = managedCommunitySsoRuntime().hubOrigin;
    return <div className={styles.page}><section className={styles.formCard}><h1 id="password-title">GG HUB 비밀번호 관리</h1><p>이 계정은 GG HUB로 로그인합니다. 비밀번호 변경과 복구는 GG HUB에서 진행해 주세요.</p><a className={styles.primaryLink} href={`${hubOrigin}/account/password`}>GG HUB에서 비밀번호 변경</a><div className={styles.links}><Link href="/account">계정으로 돌아가기</Link></div></section></div>;
  }
  return <div className={styles.page}><div className={styles.accessGrid}>
    <section className={styles.formCard} aria-labelledby="password-title"><h1 id="password-title">비밀번호 변경</h1>{account ? <AccountPasswordForm revision={account.revision} nextPath={next} /> : <div className={styles.message} data-tone="error" role="alert">계정 정보를 불러오지 못했습니다.</div>}<div className={styles.links}><Link href={SERVICE_BRAND.id === "hub" ? "/login" : "/account"}>{SERVICE_BRAND.id === "hub" ? "GG HUB 로그인으로" : "계정으로 돌아가기"}</Link></div></section>
  </div></div>;
}
