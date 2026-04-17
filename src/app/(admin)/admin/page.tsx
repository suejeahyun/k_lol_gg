import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="page-container">
      <h1 className="page-title">관리자 페이지</h1>

      <div className="card-grid">
        <Link href="/admin/players" className="list-card">
          <div className="list-card__title">플레이어 관리</div>
          <div className="list-card__meta">
            <div>플레이어 등록 / 수정 / 삭제</div>
          </div>
        </Link>

        <Link href="/admin/champions" className="list-card">
          <div className="list-card__title">챔피언 관리</div>
          <div className="list-card__meta">
            <div>챔피언 등록 / 수정 / 삭제</div>
          </div>
        </Link>

        <Link href="/admin/seasons" className="list-card">
          <div className="list-card__title">시즌 관리</div>
          <div className="list-card__meta">
            <div>시즌 생성 / 활성화</div>
          </div>
        </Link>

        <Link href="/admin/matches" className="list-card">
          <div className="list-card__title">내전 관리</div>
          <div className="list-card__meta">
            <div>내전 목록 / 수정 / 삭제</div>
          </div>
        </Link>

        <Link href="/admin/matches/new" className="list-card">
          <div className="list-card__title">내전 등록</div>
          <div className="list-card__meta">
            <div>새 내전 및 세트 등록</div>
          </div>
        </Link>
      </div>
    </div>
  );
}