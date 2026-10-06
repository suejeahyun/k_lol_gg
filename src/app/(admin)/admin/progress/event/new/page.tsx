import Link from "next/link";
import { ArrowLeft } from "@/components/theme/theme-icons";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { EventCreateForm } from "./event-create-form";
import styles from "../event-admin.module.css";

export default async function NewEventPage() {
  await requirePageRole("ADMIN", "/admin/progress/event/new");
  return <main className={styles.page}><Link href="/admin/progress/event"><ArrowLeft aria-hidden="true" /> 목록으로</Link><header><h1>새 이벤트전</h1></header><EventCreateForm /></main>;
}
