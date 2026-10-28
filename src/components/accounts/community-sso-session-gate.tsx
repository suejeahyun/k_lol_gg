"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** A same-origin request can resume the hub's existing Strict cookie after arrival. */
export function CommunitySsoSessionGate({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = response.ok ? await response.json() : null;
      if (data?.account?.status === "APPROVED" && !data.account.mustChangePassword) router.refresh();
    }).catch(() => {});
    return () => controller.abort();
  }, [router]);
  return <p>GG HUB 계정을 확인하고 있습니다. 로그인이 필요하면 <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>GG HUB에 로그인</Link>해 주세요.</p>;
}
