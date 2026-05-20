export default function Loading() {
  return (
    <div className="main-loading">
      <div className="main-loading__box">
        <div className="main-loading__spinner" />
        <p className="main-loading__text">데이터를 불러오는 중입니다.</p>
      </div>
    </div>
  );
}