import { notFound } from "next/navigation";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { authorizeSession } from "@/modules/auth/application/authorize-session";
import { communitySsoRepository, readCommunitySsoQuery } from "@/modules/auth/infrastructure/runtime-community-sso";
import { CommunitySsoConsent } from "@/components/accounts/community-sso-consent";
import { CommunitySsoSessionGate } from "@/components/accounts/community-sso-session-gate";
import styles from "@/components/accounts/account-access.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "커뮤니티 로그인 연결", robots: { index: false, follow: false } };
export default async function CommunitySsoAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (SERVICE_BRAND.id !== "hub") notFound();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value !== undefined) search.set(key, value);
  }
  const request = readCommunitySsoQuery(search);
  if (!request) notFound();
  const authorization = authorizeSession(await getCurrentSession("ACCOUNT"), "USER");
  if (!authorization.allowed) return <div className={styles.page}><section className={styles.formCard}><h1>GG HUB 계정 확인</h1><CommunitySsoSessionGate nextPath={`/sso/authorize?${search}`} /></section></div>;
  const target = await communitySsoRepository().authorizationTarget(request, authorization.session.userId).catch(() => null);
  return <div className={styles.page}><section className={styles.formCard}>
    <h1>커뮤니티 로그인 연결</h1>
    {target ? <CommunitySsoConsent request={request} siteName={target.name} origin={target.origin} /> : <p role="alert">사이트가 아직 공개되지 않았거나 로그인 연결을 사용할 수 없습니다. 사이트 운영팀에 확인해 주세요.</p>}
  </section></div>;
}
