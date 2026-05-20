import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-container">
      <section className="card balance-form-card app-error-card">
        <p className="page-eyebrow">404</p>
        <h1 className="page-title">페이지를 찾을 수 없습니다.</h1>
        <p className="app-error-card__message">
          주소가 변경되었거나 삭제된 페이지입니다.
        </p>
        <Link href="/" className="app-button">
          메인으로 이동
        </Link>
      </section>
    </main>
  );
}
