import { ReactNode } from "react";
import { cookies } from "next/headers";
import AppTopBar from "@/components/AppTopBar";
import UserSidebar from "@/components/UserSidebar";

type UserLayoutProps = {
  children: ReactNode;
};

export default async function UserLayout({ children }: UserLayoutProps) {
  const cookieStore = await cookies();

  // 로그인 API에서 실제 저장하는 쿠키 이름으로 변경
  const token = cookieStore.get("token");

  const isLoggedIn = Boolean(token);

  return (
    <div className="app-shell">
      <AppTopBar title="유저 페이지" homeHref="/" mode="user" />

      <div className="app-body">
        <UserSidebar isLoggedIn={isLoggedIn} />
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}