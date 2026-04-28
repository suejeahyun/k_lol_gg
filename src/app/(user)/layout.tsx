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

      <div className="app-body">
        <UserSidebar isLoggedIn={true} />
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}