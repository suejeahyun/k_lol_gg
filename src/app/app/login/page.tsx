import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppLoginForm } from "@/components/app-mobile/AppLoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 로그인",
  description: "K-LOL.GG 모바일 계정에 로그인합니다.",
  robots: { index: false, follow: false },
};

type AppLoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

function safeNextPath(value?: string) {
  if (!value) return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  if (value.startsWith("/api/")) return "/app";
  return value;
}

export default async function AppLoginPage({ searchParams }: AppLoginPageProps) {
  const params = await searchParams;
  const nextPath = safeNextPath(params?.next);
  const cookieStore = await cookies();
  const token = cookieStore.get("user_token");

  if (token) {
    redirect(nextPath);
  }

  return (
    <div className="klol-app-root klol-app-root--login">
      <AppLoginForm next={nextPath} />
    </div>
  );
}
