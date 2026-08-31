import { ReactNode } from "react";
import AppTopBar from "@/components/AppTopBar";
import UserSidebar from "@/components/UserSidebar";
import SkipLink from "@/components/SkipLink";

type UserLayoutProps = {
  children: ReactNode;
};

export default function UserLayout({ children }: UserLayoutProps) {
  return (
    <div className="app-shell app-shell--user">
      <SkipLink />
      <AppTopBar title="유저 페이지" homeHref="/" mode="user" />

      <div className="app-body">
        <UserSidebar />
        <div id="main-content" className="app-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
