import Link from "next/link";
import { AppBottomNav } from "./AppBottomNav";

export function AppMobileShell({
  title = "K-LOL.GG",
  subtitle = "내전 운영 앱",
  children,
}: {
  title?: string;
  subtitle?: string;
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
          <Link className="klol-app-header-action" href="/">
            PC 화면
          </Link>
        </header>
        {children}
      </div>
      <AppBottomNav />
    </div>
  );
}
