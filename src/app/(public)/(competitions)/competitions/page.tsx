import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { Gavel, PartyPopper } from "@/components/theme/theme-icons";
import { notFound, permanentRedirect } from "next/navigation";

import styles from "./events.module.css";

export const metadata = createRouteMetadata("/competitions");

export default async function CompetitionsEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  if (Object.keys(raw).length === 0) {
    return <div className={styles.page}>
      <header className={styles.hero}><div><h1>대회</h1></div><Gavel aria-hidden="true" /></header>
      <section className={styles.grid} aria-label="대회 종류">
        <Link className={styles.card} data-kind="event" href="/competitions/events"><PartyPopper aria-hidden="true" /><h2>이벤트전</h2><span className={styles.more}>이벤트전 보기</span></Link>
        <Link className={styles.card} data-kind="destruction" href="/competitions/destruction"><Gavel aria-hidden="true" /><h2>멸망전</h2><span className={styles.more}>멸망전 보기</span></Link>
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
