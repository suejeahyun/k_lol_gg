import { ListNavigationMemory } from "@/components/navigation/list-return";
import { WorkflowNavigation } from "@/components/navigation/workflow-navigation";
import { SiteShell } from "@/components/site-shell";
import { Suspense } from "react";
import { UsageTracker } from "@/components/usage/usage-tracker";
import { usageEnabled } from "@/modules/usage/domain/usage";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { HubShell } from "@/components/hub/hub-shell";
import { ManagedCommunityShell } from "@/components/community-sites/managed-community-shell";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  if (SERVICE_BRAND.id === "hub") return <HubShell>{children}</HubShell>;
  if (SERVICE_BRAND.id === "community") return <ManagedCommunityShell>{children}</ManagedCommunityShell>;
  return <SiteShell><Suspense fallback={null}><WorkflowNavigation /><ListNavigationMemory /></Suspense>{children}{usageEnabled(process.env) ? <Suspense fallback={null}><UsageTracker /></Suspense> : null}</SiteShell>;
}
