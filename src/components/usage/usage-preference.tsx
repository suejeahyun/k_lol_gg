"use client";
import { useSyncExternalStore } from "react";
import { USAGE_OPT_OUT, usageOptedOut } from "./usage-tracker";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("usage-preference", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("usage-preference", callback); };
};
export function UsagePreference() {
  const excluded = useSyncExternalStore(subscribe, usageOptedOut, () => true);
  return <label><input type="checkbox" checked={excluded} onChange={(e) => {
    try { localStorage.setItem(USAGE_OPT_OUT, e.target.checked ? "1" : "0"); window.dispatchEvent(new Event("usage-preference")); } catch { /* Storage-disabled browsers are excluded. */ }
  }} /> 이 브라우저의 방문·클릭 통계 수집 제외</label>;
}
