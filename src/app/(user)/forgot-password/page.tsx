import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 찾기",
  description: "K-LOL.GG 계정의 비밀번호 재설정을 요청합니다.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main>
      <ForgotPasswordForm />
    </main>
  );
}
