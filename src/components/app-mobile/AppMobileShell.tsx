import Link from "next/link";
import { AppBottomNav } from "./AppBottomNav";
import { AppAdminBottomNav } from "./AppAdminBottomNav";
import AppTopAccountSwitch from "@/components/AppTopAccountSwitch";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export function AppMobileShell({
  title = "K-LOL.GG",
  subtitle = "K-LOL.GG APP",
  mode = "user",
  children,
}: {
  title?: string;
  subtitle?: string;
  mode?: "user" | "admin";
  children: React.ReactNode;
}) {
  return (
    <div className="klol-app-root">
      <div className="klol-app-shell">
        <header className="klol-app-header">
          <Link className="klol-app-brand" href={mode === "admin" ? "/app/admin" : "/app"} aria-label="K-LOL.GG 앱 홈">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </Link>
          <div className="klol-app-header-tools">
            <ThemeSwitcher compact />
            <AppTopAccountSwitch mode={mode} />
          </div>
        </header>
        {children}
      </div>
      {mode === "admin" ? <AppAdminBottomNav /> : <AppBottomNav />}
    </div>
  );
}
