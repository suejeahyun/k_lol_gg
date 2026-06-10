import Link from "next/link";
import { AppBottomNav } from "./AppBottomNav";
import AppTopAccountSwitch from "@/components/AppTopAccountSwitch";

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
          <Link className="klol-app-brand" href="/app" aria-label="K-LOL.GG 앱 홈">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </Link>
          <AppTopAccountSwitch mode={mode} />
        </header>
        {children}
      </div>
      <AppBottomNav />
    </div>
  );
}
