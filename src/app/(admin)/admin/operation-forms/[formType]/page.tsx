import { AdminOperationFormList } from "@/components/operation-forms/admin-operation-form-list";
import { notFound } from "next/navigation";
import { isOperationFormType } from "@/modules/recruiting/operation-forms/domain";

export const dynamic = "force-dynamic";
export default async function OperationFormTypePage({ params, searchParams }: { params: Promise<{ formType: string }>; searchParams: Promise<{ status?: string | string[] }> }) {
  const [{ formType }, search] = await Promise.all([params, searchParams]);
  if (!isOperationFormType(formType)) notFound();
  return <AdminOperationFormList selectedType={formType} selectedStatus={Array.isArray(search.status) ? search.status[0] : search.status} />;
}
