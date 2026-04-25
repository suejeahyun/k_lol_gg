import Link from "next/link";

export default function AdminSidebar() {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__title">관리자 메뉴</div>

      <nav className="app-sidebar__nav">
        <Link href="/admin/matches" className="app-sidebar__link">
          내전 관리
        </Link>

        <Link href="/admin/matches/new" className="app-sidebar__link">
          내전 등록
        </Link>

        <Link href="/admin/players" className="app-sidebar__link">
          플레이어 관리
        </Link>

        <Link href="/admin/champions" className="app-sidebar__link">
          챔피언 관리
        </Link>

        <Link href="/admin/seasons" className="app-sidebar__link">
          시즌 관리
        </Link>

        <Link href="/admin/progress/event" className="app-sidebar__link">
          이벤트 내전 관리
        </Link>
        <Link href="/admin/progress/destruction" className="app-sidebar__link">
          멸망전 관리
        </Link>
        <Link href="/admin/notices" className="app-sidebar__link">
          공지사항 관리
        </Link>

        <Link href="/admin/images" className="app-sidebar__link">
          멸망전 우승팀 관리
        </Link>
      </nav>
    </aside>
  );
}