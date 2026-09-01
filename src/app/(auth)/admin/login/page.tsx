import type { Metadata } from "next";
import { AdminLoginPage } from "@/components/auth/admin-login-page";
import { normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";

export const metadata: Metadata = {
  title: "관리자 로그인",
  robots: { index: false, follow: false, noarchive: true },
};

type AdminLoginRouteProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function AdminLoginRoute({ searchParams }: AdminLoginRouteProps) {
  const params = await searchParams;
  return <AdminLoginPage nextPath={normalizeInternalNext(params.next)} />;
}
