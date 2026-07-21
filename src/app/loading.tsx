export default function Loading() {
  return (
    <main className="main-loading" aria-live="polite" aria-busy="true">
      <div className="main-loading__box">
        <div className="main-loading__spinner" aria-hidden="true" />
        <p className="main-loading__text">데이터를 불러오는 중입니다.</p>
      </div>
    </main>
  );
}
