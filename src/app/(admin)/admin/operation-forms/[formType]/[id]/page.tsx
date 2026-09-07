import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminOperationFormActions } from "@/components/operation-forms/admin-operation-form-actions";
import { typeLabels } from "@/components/operation-forms/admin-operation-form-list";
import styles from "@/components/operation-forms/operation-forms.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { isOperationFormType } from "@/modules/recruiting/operation-forms/domain";
import { loadRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";

export const dynamic = "force-dynamic";
const fieldLabels: Readonly<Record<string, string>> = Object.freeze({ applicantName: "신청자 이름", applicantNickname: "신청자 닉네임", friendName: "친구 이름", friendNickname: "친구 닉네임", usagePeriod: "이용 기간", discordNicknameChange: "Discord 닉네임 변경", periodStart: "시작일", periodEnd: "종료일", legacyPeriodText: "기존 휴식 기간", reason: "사유", scope: "범위", hostName: "주최자 이름", hostNickname: "주최자 닉네임", meetupAt: "모임 일시", legacyDateText: "기존 모임 일시", location: "장소", participants: "참가자", content: "내용" });

export default async function OperationFormDetailPage({ params }: { params: Promise<{ formType: string; id: string }> }) {
  const { formType, id } = await params; await requirePageRole("ADMIN", `/admin/operation-forms/${formType}/${id}`);
  if (!isOperationFormType(formType)) notFound();
  const result = await loadRuntimeOperationForms((service) => service.get(formType, id));
  if (result.state === "ready" && !result.data) notFound();
  if (result.state !== "ready") return <main className={styles.page}><section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h1>신청서 상세를 불러올 수 없습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>;
  const form = result.data!;
  return <main className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>ADMIN · DETAIL</span><h1>{typeLabels[form.formType]}</h1><p>{form.status} · revision {form.revision}</p></div><Link className={styles.link} href={`/admin/operation-forms/${form.formType}`}>목록으로</Link></header>
    <div className={styles.detailGrid}><section className={styles.panel}><h2>접수 내용</h2><dl className={styles.facts}>{Object.entries(form.payload).map(([key, value]) => <div key={key}><dt>{fieldLabels[key] ?? key}</dt><dd>{Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? value ? "예" : "아니요" : String(value)}</dd></div>)}<div><dt>접수 시각</dt><dd>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(form.submittedAt))}</dd></div></dl></section><AdminOperationFormActions form={form} /></div>
  </main>;
}
