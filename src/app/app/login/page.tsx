import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppLoginForm } from "@/components/app-mobile/AppLoginForm";
import { getCurrentUser } from "@/lib/auth/session";
import { safeLocalNextPath } from "@/lib/navigation/safe-next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 로그인",
  description: "K-LOL.GG 모바일 계정에 로그인합니다.",
  robots: { index: false, follow: false },
};

type AppLoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function AppLoginPage({ searchParams }: AppLoginPageProps) {
  const params = await searchParams;
  const nextPath = safeLocalNextPath(params?.next, { fallback: "/app" });
  const user = await getCurrentUser();

  if (user) {
    redirect(nextPath);
  }

  return (
    <div className="klol-app-root klol-app-root--login">
      <AppLoginForm next={nextPath} />
    </div>
  );
}
