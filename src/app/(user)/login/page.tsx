import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "로그인",
  description: "K-LOL.GG 계정에 로그인합니다.",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("user_token");

  if (token) {
    redirect("/");
  }

  return (
    <main>
      <LoginForm />
    </main>
  );
}
