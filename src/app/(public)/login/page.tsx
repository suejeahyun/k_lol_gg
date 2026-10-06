import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { UserLoginForm } from "@/components/accounts/account-auth-forms";
import styles from "@/components/accounts/account-access.module.css";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";

export const metadata = createRouteMetadata("/login");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const nextPath = normalizeAccountNext((await searchParams).next, "/");
  return (
    <div className={styles.page}>
      <div className={styles.accessGrid}>
        <section className={styles.formCard} aria-labelledby="login-title">
          <h1 id="login-title">로그인</h1>
          <UserLoginForm nextPath={nextPath} />
        </section>
      </div>
    </div>
  );
}
