import type { Metadata } from "next";
import Link from "next/link";
import { Gavel, PartyPopper } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";

import styles from "./events.module.css";

export const metadata: Metadata = {
  title: "대회 종류 선택",
  description: "K-LOL.GG 이벤트 대회와 멸망전을 각각 확인하세요.",
  alternates: { canonical: "/competitions" },
};

export default async function CompetitionsEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  if (Object.keys(raw).length === 0) {
    return <div className={styles.page}>
      <header className={styles.hero}><div><span><PartyPopper aria-hidden="true" /> COMPETITIONS</span><h1>대회 종류를 선택해 주세요.</h1><p>친선 이벤트 대회와 경매·예선·본선으로 이어지는 멸망전은 서로 다른 운영 흐름으로 진행합니다.</p></div><Gavel aria-hidden="true" /></header>
      <section className={styles.grid} aria-label="대회 종류">
        <Link className={styles.card} href="/competitions/events"><header><span>친선 대회</span><b>EVENT</b></header><h2>이벤트 대회</h2><p>이벤트 모집, 팀 편성, 대진과 결과를 확인합니다.</p><span className={styles.more}>이벤트 대회 보기</span></Link>
        <Link className={styles.card} href="/competitions/destruction"><header><span>독립 운영</span><b>DESTRUCTION</b></header><h2>멸망전</h2><p>주장 선정, 경매, 예선과 본선 결과를 확인합니다.</p><span className={styles.more}>멸망전 보기</span></Link>
      </section>
    </div>;
  }
  const type = raw.type;
  if (Array.isArray(type) || (type !== undefined && type !== "event" && type !== "destruction")) notFound();
  const target = type === "destruction" ? "/competitions/destruction" : "/competitions/events";
  const query = new URLSearchParams();
  for (const key of ["q", "status", "format", "page", "pageSize"] as const) {
    const value = raw[key];
    if (Array.isArray(value)) notFound();
    if (typeof value === "string") query.set(key, value);
  }
  if (Object.keys(raw).some((key) => !["type", "q", "status", "format", "page", "pageSize"].includes(key))) notFound();
  permanentRedirect(query.size ? `${target}?${query.toString()}` : target);
}
