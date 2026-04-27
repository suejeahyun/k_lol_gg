import Link from "next/link";
import AuthSection from "./AuthSection";

export default function UserSidebar() {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__top">
        <div className="app-sidebar__title">메뉴</div>

        <nav className="app-sidebar__nav">
          <Link href="/" className="app-sidebar__link">홈</Link>
          <Link href="/players" className="app-sidebar__link">플레이어</Link>
          <Link href="/matches" className="app-sidebar__link">내전 기록</Link>
          <Link href="/rankings" className="app-sidebar__link">랭킹</Link>
          <Link href="/players/balance" className="app-sidebar__link">팀 밸런스 생성</Link>
          <Link href="/participation" className="app-sidebar__link">내전 참가</Link>
          <Link href="/progress" className="app-sidebar__link">멸망전 / 이벤트 내전</Link>
          <Link href="/notices" className="app-sidebar__link">공지사항</Link>
        </nav>
      </div>

      <div className="app-sidebar__bottom">
        <AuthSection />
      </div>
    </aside>
  );
}