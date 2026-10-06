import { notFound } from "next/navigation";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeChampions } from "@/modules/champions/infrastructure/runtime-champions";
import { AdminContentTabs } from "@/components/admin/media/admin-media-pages";
import { Sparkles } from "@/components/theme/theme-icons";

import { ChampionForm } from "../../champion-form";
import styles from "@/components/admin/media/admin-media.module.css";

export const dynamic = "force-dynamic";

export default async function EditChampionPage({ params }: { params: Promise<{ championId: string }> }) {
  const { championId } = await params;
  await requirePageRole("ADMIN", `/admin/champions/${championId}/edit`);
  const result = await loadRuntimeChampions(true, (service) => service.getAdmin(championId));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <main className={styles.page}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Sparkles aria-hidden="true" /><h1>챔피언을 불러오지 못했습니다.</h1></section></main>;
  return <main className={styles.page}><header className={styles.header}><div><strong>{result.data!.status} · rev. {result.data!.revision}</strong><h1>{result.data!.displayName}</h1></div></header><AdminContentTabs active="champion" /><ChampionForm key={`${result.data!.key}-${result.data!.revision}`} initial={result.data!} /></main>;
}
