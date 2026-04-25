import Link from "next/link";

export default function DestructionProgressPage() {
  return (
    <main className="page-container destruction-progress-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">DESTRUCTION MATCH</p>
          <h1 className="page-title">멸망전</h1>
          <p className="page-description">
            팀장 선정, 예선 풀리그, 상위 4팀 토너먼트, 결승 진행 현황을 확인하는 페이지입니다.
          </p>
        </div>

        <div className="page-actions">
          <Link href="/progress" className="btn btn-ghost">
            진행현황으로
          </Link>
        </div>
      </div>

      <section className="destruction-status-grid">
        <div className="destruction-status-card">
          <span>현재 상태</span>
          <strong>준비중</strong>
          <p>멸망전 관리 기능은 이벤트 내전 기능 완료 후 개발 예정입니다.</p>
        </div>

        <div className="destruction-status-card">
          <span>예선 방식</span>
          <strong>풀리그</strong>
          <p>모든 팀이 예선을 진행하고, 상위 4팀이 토너먼트에 진출합니다.</p>
        </div>

        <div className="destruction-status-card">
          <span>경기 방식</span>
          <strong>3판 2선제</strong>
          <p>예선과 결승 모두 3판 2선제를 기준으로 진행합니다.</p>
        </div>

        <div className="destruction-status-card">
          <span>승점 규칙</span>
          <strong>예선 전용</strong>
          <p>예선에서만 승점 규칙을 적용합니다.</p>
        </div>
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>예정 기능</h2>
        </div>

        <div className="destruction-feature-list">
          <div className="destruction-feature-item">
            <strong>팀장 관리</strong>
            <span>팀 수에 맞춰 팀장을 등록하고 관리합니다.</span>
          </div>

          <div className="destruction-feature-item">
            <strong>참가자 관리</strong>
            <span>참가자와 지정 포지션을 등록합니다.</span>
          </div>

          <div className="destruction-feature-item">
            <strong>예선 풀리그</strong>
            <span>팀별 예선 경기와 승점을 자동 집계합니다.</span>
          </div>

          <div className="destruction-feature-item">
            <strong>상위 4팀 토너먼트</strong>
            <span>예선 순위 기준으로 준결승과 결승을 구성합니다.</span>
          </div>

          <div className="destruction-feature-item">
            <strong>MVP / 우승팀</strong>
            <span>관리자가 MVP와 우승팀을 최종 지정합니다.</span>
          </div>
        </div>
      </section>
    </main>
  );
}