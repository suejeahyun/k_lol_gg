import Link from "next/link";
import {
  Home,
  Images,
  MessagesSquare,
  Search,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";

const primaryNavigation = [
  { href: "/players", label: "플레이어", icon: UsersRound },
  { href: "/#roadmap", label: "경기", icon: Swords },
  { href: "/#roadmap", label: "대회", icon: Trophy },
  { href: "/#roadmap", label: "커뮤니티", icon: MessagesSquare },
] as const;

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-canvas">
      <a className="skip-link" href="#main-content">
        본문 바로가기
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link className="brand" href="/" aria-label="K-LOL.GG V2 홈">
            <span className="brand__mark" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <span>
              <strong>K-LOL.GG</strong>
              <small>새로운 내전 놀이터</small>
            </span>
          </Link>

          <nav className="desktop-nav" aria-label="주요 메뉴">
            {primaryNavigation.map(({ href, label, icon: Icon }) => (
              <Link href={href} key={label}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            <Link className="header-search" href="/players" aria-label="플레이어 검색">
              <Search size={17} />
            </Link>
            <Link
              className="header-account"
              href="/#roadmap"
              aria-label="로그인 기능 준비 상태 보기"
            >
              <UserRound size={17} />
              <span>로그인</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer">
        <div>
          <strong>K-LOL.GG V2</strong>
          <p>V1의 기능 계약을 새 구조로 하나씩 다시 구현하고 있습니다.</p>
        </div>
        <p className="riot-disclaimer">
          K-LOL.GG는 Riot Games 소유 자산을 사용하여{" "}
          <a href="https://www.riotgames.com/en/legal">Riot Games의 Legal Jibber Jabber 정책</a>에
          따라 제작된 팬 프로젝트입니다. Riot Games는 이 프로젝트를 승인하거나 후원하지
          않습니다.
        </p>
      </footer>

      <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
        <Link href="/">
          <Home size={20} />
          <span>홈</span>
        </Link>
        <Link href="/players">
          <UsersRound size={20} />
          <span>플레이어</span>
        </Link>
        <Link href="/#roadmap">
          <Swords size={20} />
          <span>내전</span>
        </Link>
        <Link href="/#roadmap">
          <Trophy size={20} />
          <span>대회</span>
        </Link>
        <Link href="/#roadmap">
          <Images size={20} />
          <span>커뮤니티</span>
        </Link>
      </nav>
    </div>
  );
}
