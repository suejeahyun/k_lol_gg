import Link from "next/link";
import { ReactNode } from "react";
import AppTopBar from "@/components/AppTopBar";
import UserSidebar from "@/components/UserSidebar";

type UserLayoutProps = {
  children: ReactNode;
};

export default function UserLayout({ children }: UserLayoutProps) {
  return (
    <div className="app-shell">
      <AppTopBar title="유저 페이지" homeHref="/" mode="user" />

      <div className="user-subnav">
        <div className="user-subnav__inner">
          <Link href="/players" className="user-subnav__link">
            플레이어 목록
          </Link>
          <Link href="/players/balance" className="user-subnav__link">
            팀 밸런스
          </Link>
          <Link href="/matches" className="user-subnav__link">
            내전 목록
          </Link>
        </div>
      </div>

      <div className="app-body">
        <UserSidebar />
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}