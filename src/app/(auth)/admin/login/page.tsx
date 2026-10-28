import type { Metadata } from "next";
import { AdminLoginPage } from "@/components/auth/admin-login-page";
import { normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";
import { SERVICE_BRAND } from "@/lib/service-brand";
import Link from "next/link";
import styles from "@/components/accounts/account-access.module.css";

export const metadata: Metadata = {
  title: "관리자 로그인",
  robots: { index: false, follow: false, noarchive: true },
};

type AdminLoginRouteProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function AdminLoginRoute({ searchParams }: AdminLoginRouteProps) {
  const params = await searchParams;
  if (SERVICE_BRAND.id === "community") {
    const nextPath = normalizeInternalNext(params.next);
    return <><div className={styles.page}><section className={styles.formCard}><h1>커뮤니티 관리자 로그인</h1><p>이 커뮤니티의 관리자 권한을 가진 GG HUB 계정으로 로그인합니다.</p><Link className={styles.primaryLink} href={`/api/auth/community-sso/start?purpose=ADMIN&next=${encodeURIComponent(nextPath)}`}>GG HUB로 관리자 로그인</Link></section></div><AdminLoginPage nextPath={nextPath} /></>;
  }
  return <AdminLoginPage nextPath={normalizeInternalNext(params.next)} />;
}
