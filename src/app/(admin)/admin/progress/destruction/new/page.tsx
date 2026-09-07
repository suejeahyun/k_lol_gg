import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

import styles from "../../event/event-admin.module.css";
import { DestructionCreateForm } from "./destruction-create-form";

export default async function NewDestructionPage() {
  await requirePageRole("ADMIN", "/admin/progress/destruction/new");
  return <main className={styles.page}><Link href="/admin/progress/destruction"><ArrowLeft aria-hidden="true" /> 목록으로</Link><header><h1>새 멸망전</h1><p>팀 수, 예선 방식과 포지션별 모집 상한을 먼저 정합니다.</p></header><DestructionCreateForm /></main>;
}
