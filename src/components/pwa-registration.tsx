"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    // Dev chunk URLs are stable across edits; the production cache would hide HMR updates.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        for (const registration of registrations) {
          const worker = registration.active ?? registration.waiting ?? registration.installing;
          if (worker?.scriptURL === `${window.location.origin}/sw.js`) await registration.unregister();
        }
      }).catch(() => undefined);
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
