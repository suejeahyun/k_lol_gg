import { StatusPanel } from "@/components/status-panel";

export default function Loading() {
  return (
    <div className="page-wrap status-page" role="status" aria-live="polite">
      <StatusPanel
        title="불러오는 중"
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
