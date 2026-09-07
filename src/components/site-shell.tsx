import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Suspense } from "react";

import {
  HeaderUserControls,
  MobileUserNavigation,
  NavigationFallback,
  PrimaryUserNavigation,
} from "@/components/navigation/user-site-navigation";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";

export async function SiteShell({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession("ACCOUNT");
  const accountSignedIn = session?.purpose === "ACCOUNT";
  return (
    <div className="site-canvas">
      <a className="skip-link" href="#main-content">
        본문 바로가기
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" href="/" aria-label="K-LOL.GG 홈">
            <span className="brand__mark" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <span>
              <strong>K-LOL.GG</strong>
              <small>새로운 내전 놀이터</small>
            </span>
          </Link>

          <Suspense fallback={<NavigationFallback />}>
            <PrimaryUserNavigation />
          </Suspense>

          <HeaderUserControls accountSignedIn={accountSignedIn} />
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer">
        <div>
          <strong>K-LOL.GG</strong>
          <p>함께 즐긴 내전의 기록과 다음 경기를 한곳에서 만나보세요.</p>
          <p><Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보 처리 안내</Link></p>
        </div>
        <p className="riot-disclaimer">
          K-LOL.GG는 Riot Games 소유 자산을 사용하여{" "}
          <a href="https://www.riotgames.com/en/legal">Riot Games의 Legal Jibber Jabber 정책</a>에
          따라 제작된 팬 프로젝트입니다. Riot Games는 이 프로젝트를 승인하거나 후원하지
          않습니다.
        </p>
      </footer>

      <Suspense fallback={<NavigationFallback mobile />}>
        <MobileUserNavigation accountSignedIn={accountSignedIn} />
      </Suspense>
    </div>
  );
}
