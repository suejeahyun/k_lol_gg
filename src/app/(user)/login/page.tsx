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
    signup?: string | string[];
  }>;
};

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeLocalNextPath(firstSearchParam(params?.next));
  const signupStatus = firstSearchParam(params?.signup);
  const user = await getCurrentUser();

  if (user) {
    redirect(nextPath);
  }

  return (
    <main>
      <LoginForm
        nextPath={nextPath}
        notice={
          signupStatus === "pending"
            ? "가입 신청이 접수되었습니다. 운영자 승인 전에도 로그인해 승인 상태를 확인할 수 있습니다."
            : undefined
        }
      />
    </main>
  );
}
