import type { Metadata } from "next";
import { AdminLoginPage, normalizeInternalNext } from "@/components/auth/admin-login-page";

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
