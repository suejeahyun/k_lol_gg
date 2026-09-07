import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { EventCreateForm } from "./event-create-form";
import styles from "../event-admin.module.css";

export default async function NewEventPage() {
  await requirePageRole("ADMIN", "/admin/progress/event/new");
  return <main className={styles.page}><Link href="/admin/progress/event"><ArrowLeft aria-hidden="true" /> 목록으로</Link><header><h1>새 이벤트전</h1><p>BO1·3·5·7·9와 모집 기간을 먼저 정합니다.</p></header><EventCreateForm /></main>;
}
