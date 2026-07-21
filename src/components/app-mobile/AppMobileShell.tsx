import Link from "next/link";
import { AppBottomNav } from "./AppBottomNav";
import { AppAdminBottomNav } from "./AppAdminBottomNav";
import AppTopAccountSwitch from "@/components/AppTopAccountSwitch";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { getSiteSettings } from "@/lib/site/settings";

export async function AppMobileShell({
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
  const settings = await getSiteSettings();
  const displayTitle = title === "K-LOL.GG" ? settings.siteName : title;
  const displaySubtitle = subtitle === "K-LOL.GG APP"
    ? settings.siteTagline || `${settings.siteName} APP`
    : subtitle;

  return (
    <div className="klol-app-root">
      <div className="klol-app-shell">
        <header className="klol-app-header">
          <Link className="klol-app-brand" href={mode === "admin" ? "/app/admin" : "/app"} aria-label={`${displayTitle} 앱 홈`}>
            <strong>{displayTitle}</strong>
            <span>{displaySubtitle}</span>
          </Link>
          <div className="klol-app-header-tools">
            <ThemeSwitcher compact />
            <AppTopAccountSwitch mode={mode} />
          </div>
        </header>
        <main className="klol-app-main">{children}</main>
      </div>
      {mode === "admin" ? <AppAdminBottomNav /> : <AppBottomNav />}
    </div>
  );
}
