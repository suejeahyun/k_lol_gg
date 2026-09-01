import { StatusPanel } from "@/components/status-panel";

export default function Loading() {
  return (
    <div className="page-wrap status-page" role="status" aria-live="polite">
      <StatusPanel
        eyebrow="LOADING"
        title="화면을 준비하고 있어요"
        description="필요한 정보를 차분히 모으는 중입니다. 잠시만 기다려 주세요."
      >
        <span className="status-panel__loading" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </StatusPanel>
    </div>
  );
}
