export default function PlayerRegistryLoading() {
  return (
    <div className="page-wrap players-page" role="status" aria-live="polite">
      <div className="registry-skeleton" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <p className="sr-only">플레이어 정보를 불러오는 중입니다.</p>
    </div>
  );
}
