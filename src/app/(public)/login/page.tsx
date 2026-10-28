import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { UserLoginForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";
import { SERVICE_BRAND } from "@/lib/service-brand";
import Link from "next/link";

export const metadata = createRouteMetadata("/login");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; sso?: string }> }) {
  const params = await searchParams;
  const PageContainer = SERVICE_BRAND.id === "hub" || SERVICE_BRAND.id === "community" ? "main" : "div";
  const nextPath = normalizeAccountNext(params.next, "/");
  return (
    <PageContainer className={styles.page}>
      <div className={styles.accessGrid}>
        <section className={styles.formCard} aria-labelledby="login-title">
          <h1 id="login-title">{SERVICE_BRAND.id === "hub" ? "중앙 계정 로그인" : "로그인"}</h1>
          {SERVICE_BRAND.id === "hub" ? <p>GG HUB 계정으로 커뮤니티를 찾아보고 새 사이트 개설을 신청하세요. 기존 커뮤니티 계정의 권한과 기록은 자동으로 합쳐지지 않습니다.</p> : null}
          {SERVICE_BRAND.id === "community" ? <><p>GG HUB 계정으로 이 커뮤니티에 로그인하세요. 이 사이트의 기존 계정은 아래 아이디·비밀번호로 로그인할 수 있습니다.</p><Link className={styles.primaryLink} href={`/api/auth/community-sso/start?next=${encodeURIComponent(nextPath)}`}>GG HUB로 로그인</Link>{params.sso === "failed" ? <p role="alert">로그인 연결이 만료되었거나 권한을 확인하지 못했습니다. 다시 시작하거나 운영팀에 문의해 주세요.</p> : null}</> : null}
          <UserLoginForm nextPath={nextPath} />
        </section>
      </div>
    </PageContainer>
  );
}
