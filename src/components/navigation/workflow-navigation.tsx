"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkflowNavigation() {
  const pathname = usePathname();
  const links = pathname.startsWith("/matches") ? [
    { href: "/matches", label: "경기 기록" }, { href: "/matches/submit", label: "경기 결과 제출" }, { href: "/matches/submissions", label: "내 제출 기록" },
  ] : pathname.startsWith("/players") || pathname.startsWith("/rankings") ? [
    { href: "/players", label: "플레이어" }, { href: "/rankings", label: "시즌 랭킹" }, { href: "/rankings/mmr", label: "MMR" },
  ] : pathname === "/recruits" ? [
    { href: "/applications", label: "오늘 내전 신청" }, { href: "/recruits", label: "파티 찾기" }, { href: "/help/recruits", label: "참여 방법" },
  ] : ["/images", "/highlights"].some((root) => pathname.startsWith(root)) ? [
    { href: "/highlights", label: "하이라이트" }, { href: "/images", label: "갤러리" },
  ] : null;
  if (!links) return null;
  const active = links.filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  return <div className="page-wrap"><nav className="workflow-nav" aria-label="관련 기능 바로가기">{links.map((link) => <Link key={link.href} href={link.href} aria-current={active?.href === link.href ? "page" : undefined}>{link.label}</Link>)}</nav></div>;
}
