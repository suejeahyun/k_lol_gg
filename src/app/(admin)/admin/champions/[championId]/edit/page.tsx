import { notFound } from "next/navigation";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeChampions } from "@/modules/champions/infrastructure/runtime-champions";

import { ChampionForm } from "../../champion-form";
import styles from "../../champions.module.css";

export const dynamic = "force-dynamic";

export default async function EditChampionPage({ params }: { params: Promise<{ championId: string }> }) {
  const { championId } = await params;
  await requirePageRole("ADMIN", `/admin/champions/${championId}/edit`);
  const result = await loadRuntimeChampions(true, (service) => service.getAdmin(championId));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <main className={styles.page}><section className={styles.state} role="alert"><h1>챔피언을 불러오지 못했습니다.</h1><p>데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.</p></section></main>;
  return <main className={styles.page}><header className={styles.header}><div><strong>{result.data!.status} · rev. {result.data!.revision}</strong><h1>{result.data!.displayName}</h1><p>키는 경기 원장 참조를 위해 바꾸지 않으며 삭제 대신 비활성화합니다.</p></div></header><ChampionForm initial={result.data!} /></main>;
}
