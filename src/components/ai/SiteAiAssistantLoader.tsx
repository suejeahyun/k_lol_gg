"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const SiteAiAssistant = dynamic(() => import("@/components/ai/SiteAiAssistant"), {
  ssr: false,
  loading: () => null,
});

export default function SiteAiAssistantLoader() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(() => setReady(true), { timeout: 1500 });
    } else {
      timeoutId = setTimeout(() => setReady(true), 500);
    }

    return () => {
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, []);

  return ready ? <SiteAiAssistant /> : null;
}
