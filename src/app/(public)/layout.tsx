import { SiteShell } from "@/components/site-shell";
import { Suspense } from "react";
import { UsageTracker } from "@/components/usage/usage-tracker";
import { usageEnabled } from "@/modules/usage/domain/usage";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}{usageEnabled(process.env) ? <Suspense fallback={null}><UsageTracker /></Suspense> : null}</SiteShell>;
}
