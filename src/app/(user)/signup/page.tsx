import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SignupForm from "@/components/SignupForm";

export const metadata: Metadata = {
  title: "회원가입",
  description: "K-LOL.GG 계정을 만들고 플레이어 정보를 연결하세요.",
  robots: { index: false, follow: false },
};

export default async function SignupPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("user_token");

  if (token) {
    redirect("/");
  }

  return (
    <main>
      <SignupForm />
    </main>
  );
}
