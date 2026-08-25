export const dynamic = "force-dynamic";

import KakaoManagedFormsClient from "@/components/admin/KakaoManagedFormsClient";
import { getPublishedManagedTemplate } from "@/lib/kakao/managed-forms";
import { prisma } from "@/lib/prisma/client";

export default async function KakaoManagedFormsPage() {
  const [discipline, inhouse, rows] = await Promise.all([getPublishedManagedTemplate("DISCIPLINE"), getPublishedManagedTemplate("INHOUSE_RESULT"), prisma.kakaoFormTemplate.findMany({ orderBy: [{ formType: "asc" }, { version: "desc" }], take: 100 })]);
  return <main className="admin-page"><div className="admin-page__header"><div><p className="page-eyebrow">KAKAO MANAGED FORMS</p><h1>경고·내전등록 양식 관리</h1></div></div><KakaoManagedFormsClient values={[discipline, inhouse].map((item) => ({ formType: item.formType, title: item.title, instructions: item.instructions, commandAliases: item.commandAliases, fields: item.fields }))} rows={rows.map((row) => ({ id: row.id, formType: row.formType, version: row.version, status: row.status, title: row.title, updatedAt: row.updatedAt.toISOString().slice(0, 10) }))}/></main>;
}
