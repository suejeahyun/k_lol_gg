import { SERVICE_BRAND } from "@/lib/service-brand";
import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "@/components/theme/theme-icons";
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
  const isNexus = SERVICE_BRAND.id === "nexus";
  return (
    <div className="site-canvas" data-ui-scope="public">
      <a className="skip-link" href="#main-content">
        본문 바로가기
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" href="/" aria-label={`${SERVICE_BRAND.name} 홈`}>
            <span className={`brand__mark${isNexus ? " nexus-brand__mark" : ""}`} aria-hidden="true">
              {isNexus ? (
                <Image
                  className="nexus-brand__image"
                  src="/images/nexus/mascot-board.png"
                  alt=""
                  width={1254}
                  height={1254}
                  sizes="256px"
                  quality={75}
                />
              ) : <Sparkles size={20} />}
            </span>
            <span>
              <strong>{SERVICE_BRAND.name}</strong>
              {isNexus ? <small className="nexus-brand__tagline">PLAY. CONNECT. TOGETHER.</small> : null}
            </span>
          </Link>

          <Suspense fallback={<NavigationFallback />}>
            <PrimaryUserNavigation />
          </Suspense>

          <Suspense fallback={null}><HeaderUserControls accountSignedIn={accountSignedIn} /></Suspense>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer">
        <div>
          <strong>{SERVICE_BRAND.name}</strong>
          {isNexus ? <span className="nexus-footer__tagline">함께 플레이하는 우리만의 공간</span> : null}
          <p><Link href="/help">도움말·문의</Link> · <Link href="/start">처음 이용 안내</Link> · <Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보 처리 안내</Link></p>
        </div>
        <p className="riot-disclaimer">
          {SERVICE_BRAND.name}는 Riot Games 소유 자산을 사용하여{" "}
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
