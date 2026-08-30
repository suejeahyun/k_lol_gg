import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth/session";
import { safeLocalNextPath } from "@/lib/navigation/safe-next";

export const metadata: Metadata = {
  title: "로그인",
  description: "K-LOL.GG 계정에 로그인합니다.",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeLocalNextPath(firstSearchParam(params?.next));
  const user = await getCurrentUser();

  if (user) {
    redirect(nextPath);
  }

  return (
    <main>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
