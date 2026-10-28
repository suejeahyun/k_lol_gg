import { SiteShell } from "@/components/site-shell";
import { NotFoundContent } from "@/components/not-found-content";
import { HubShell } from "@/components/hub/hub-shell";
import { SERVICE_BRAND } from "@/lib/service-brand";
import Link from "next/link";

export default function NotFound() {
  if (SERVICE_BRAND.id === "hub") return <HubShell><main><NotFoundContent><Link className="status-panel__link" href="/">중앙 사이트 홈으로</Link></NotFoundContent></main></HubShell>;
  return (
    <SiteShell>
      <NotFoundContent />
    </SiteShell>
  );
}
