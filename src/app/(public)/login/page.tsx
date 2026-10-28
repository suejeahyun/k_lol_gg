import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { UserLoginForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";
import { SERVICE_BRAND } from "@/lib/service-brand";

export const metadata = createRouteMetadata("/login");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const nextPath = normalizeAccountNext((await searchParams).next, "/");
  return (
    <div className={styles.page}>
      <div className={styles.accessGrid}>
        <section className={styles.formCard} aria-labelledby="login-title">
          <h1 id="login-title">{SERVICE_BRAND.id === "hub" ? "중앙 계정 로그인" : "로그인"}</h1>
          {SERVICE_BRAND.id === "hub" ? <p>중앙 운영자 계정의 비밀번호를 설정하거나 변경합니다. 각 커뮤니티 계정과 별도로 관리됩니다.</p> : null}
          <UserLoginForm nextPath={nextPath} />
        </section>
      </div>
    </div>
  );
}
