import { AdminOperationFormList } from "@/components/operation-forms/admin-operation-form-list";

export const dynamic = "force-dynamic";
export default async function OperationFormsPage({ searchParams }: { searchParams: Promise<{ type?: string | string[]; status?: string | string[] }> }) {
  const search = await searchParams;
  return <AdminOperationFormList selectedType={Array.isArray(search.type) ? search.type[0] : search.type} selectedStatus={Array.isArray(search.status) ? search.status[0] : search.status} />;
}
