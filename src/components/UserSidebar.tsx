import Link from "next/link";

export default function UserSidebar() {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__title">유저 메뉴</div>

      <nav className="app-sidebar__nav">
        <Link href="/" className="app-sidebar__link">
          메인페이지
        </Link>
        <Link href="/players" className="app-sidebar__link">
          플레이어 목록 / 검색
        </Link>
        <Link href="/matches" className="app-sidebar__link">
          내전 목록 / 검색
        </Link>
        <Link href="/players/balance" className="app-sidebar__link">
          팀 밸런스
        </Link>
        <Link href="/rankings" className="app-sidebar__link">
          랭킹
        </Link>
        <Link href="/notices" className="app-sidebar__link">
          공지사항
        </Link>
        <Link href="/images" className="app-sidebar__link">
          이미지
        </Link>
      </nav>
    </aside>
  );
}