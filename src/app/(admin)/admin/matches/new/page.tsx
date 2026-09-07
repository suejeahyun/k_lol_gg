import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";

import { MatchEditor } from "../match-editor";
import styles from "../matches-admin.module.css";
import { AdminImportPanel } from "./admin-import-panel";

export const dynamic = "force-dynamic";

function currentKstDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function NewMatchPage() {
  const result = await loadRuntimeMatchData((service) => service.getAdminEditorCatalog());
  return <main className={styles.page}>
    <Link href="/admin/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 목록</Link>
    <section className={styles.hero}><div><p>NEW DRAFT</p><h1>새 경기 초안</h1><p>시즌·플레이어·챔피언을 선택해 구조화된 경기 기록을 만듭니다.</p></div></section>
    {result.state === "ready"
      ? <><AdminImportPanel seasons={result.data.seasons} playedOn={currentKstDate()} /><MatchEditor
          initialState={{ id: null, status: "DRAFT", revision: 0 }}
          initialBody={{
            seasonId: "",
            title: "",
            playedOn: currentKstDate(),
            startedAt: null,
            games: [],
          }}
          catalog={result.data}
        /></>
      : <section className={styles.state} role="alert">편집에 필요한 시즌·플레이어·챔피언 목록을 불러오지 못했습니다.</section>}
  </main>;
}
