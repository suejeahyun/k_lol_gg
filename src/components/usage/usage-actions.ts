"use client";

import { SERVICE_BRAND } from "@/lib/service-brand";

import { USAGE_ACTIONS } from "@/modules/usage/domain/usage";

/** Only fixed action names; never include search text, form content, IDs or URLs. */
export function recordUsageAction(action: keyof typeof USAGE_ACTIONS) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(`${SERVICE_BRAND.storagePrefix}:usage-action`, { detail: action }));
}
