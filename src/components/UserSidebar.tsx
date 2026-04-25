import Link from "next/link";

export default function UserSidebar() {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__title">메뉴</div>

      <nav className="app-sidebar__nav">
        <Link href="/" className="app-sidebar__link">
          홈
        </Link>

        <Link href="/players" className="app-sidebar__link">
          플레이어
        </Link>

        <Link href="/matches" className="app-sidebar__link">
          내전 기록
        </Link>

        <Link href="/rankings" className="app-sidebar__link">
          랭킹
        </Link>

        <Link href="/progress" className="app-sidebar__link">
          진행현황
        </Link>

        <Link href="/progress/event" className="app-sidebar__link">
          이벤트 내전
        </Link>

        <Link href="/progress/destruction" className="app-sidebar__link">
          멸망전
        </Link>

        <Link href="/notices" className="app-sidebar__link">
          공지사항
        </Link>
      </nav>
    </aside>
  );
}