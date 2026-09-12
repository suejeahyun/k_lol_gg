import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import {
  isOperationFormStatus, isOperationFormType, OPERATION_FORM_STATUSES, OPERATION_FORM_TYPES,
  type OperationFormType,
} from "@/modules/recruiting/operation-forms/domain";
import { loadRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";

import styles from "./operation-forms.module.css";

export const typeLabels: Readonly<Record<OperationFormType, string>> = Object.freeze({ friends: "친구 신청", leaves: "탈퇴·휴식", meetups: "모임 신청", suggestions: "건의" });
export const operationFormStatusLabels = Object.freeze({ PENDING: "대기", IN_REVIEW: "검토 중", COMPLETED: "완료", REJECTED: "반려", CANCELLED: "취소" });

export async function AdminOperationFormList({ selectedType, selectedStatus }: { selectedType?: string; selectedStatus?: string }) {
  await requirePageRole("ADMIN", selectedType ? `/admin/operation-forms/${selectedType}` : "/admin/operation-forms");
  const formType = isOperationFormType(selectedType) ? selectedType : undefined;
  const status = isOperationFormStatus(selectedStatus) ? selectedStatus : undefined;
  const result = await loadRuntimeOperationForms((service) => service.list({ formType, status }));
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>관리자 · 운영 신청서</span><h1>운영 신청서</h1><p>카카오에서 접수된 네 가지 신청을 분류하고 상태와 관리 메모를 처리합니다.</p></div><Link className={styles.link} href="/admin/kakao">카카오 관리</Link></header>
    <nav className={styles.typeNav} aria-label="운영 신청 유형">
      <Link href="/admin/operation-forms" aria-current={!formType ? "page" : undefined}>전체</Link>
      {OPERATION_FORM_TYPES.map((type) => <Link key={type} href={`/admin/operation-forms/${type}`} aria-current={formType === type ? "page" : undefined}>{typeLabels[type]}{result.state === "ready" ? ` ${result.data.counts[type]}` : ""}</Link>)}
    </nav>
    <form className={styles.filters} method="get" action={formType ? `/admin/operation-forms/${formType}` : "/admin/operation-forms"}>
      {!formType ? <label>유형<select name="type" defaultValue=""><option value="">전체 유형</option>{OPERATION_FORM_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label> : null}
      <label>상태<select name="status" defaultValue={status ?? ""}><option value="">전체 상태</option>{OPERATION_FORM_STATUSES.map((item) => <option key={item} value={item}>{operationFormStatusLabels[item]}</option>)}</select></label><button type="submit">필터 적용</button>
    </form>
    {result.state === "ready" && result.data.items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>유형</th><th>신청자</th><th>상태</th><th>접수</th><th /></tr></thead><tbody>{result.data.items.map((form) => {
      const applicant = "applicantName" in form.payload ? form.payload.applicantName : form.payload.hostName;
      return <tr key={form.id}><td>{typeLabels[form.formType]}</td><td>{applicant}</td><td><span className={styles.badge}>{operationFormStatusLabels[form.status]}</span></td><td>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(form.submittedAt))}</td><td><Link href={`/admin/operation-forms/${form.formType}/${form.id}`}>상세</Link></td></tr>;
    })}</tbody></table></div> : result.state === "ready" ? <section className={styles.state}><h2>조건에 맞는 신청이 없습니다.</h2><p>필터를 바꾸거나 새 접수를 기다려 주세요.</p></section> : result.state === "unavailable" ? <section className={styles.state} role="status"><h2>신청서를 확인할 수 없습니다.</h2><p>잠시 후 다시 시도해 주세요.</p></section> : <section className={styles.state} role="alert"><h2>신청서를 불러오지 못했습니다.</h2><p>잠시 후 다시 시도해 주세요.</p></section>}
  </main>;
}
