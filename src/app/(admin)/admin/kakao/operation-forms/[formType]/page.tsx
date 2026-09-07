import { notFound, permanentRedirect } from "next/navigation";
import { isOperationFormType } from "@/modules/recruiting/operation-forms/domain";
export default async function LegacyOperationFormTypePage({ params }: { params: Promise<{ formType: string }> }) { const { formType } = await params; if (!isOperationFormType(formType)) notFound(); permanentRedirect(`/admin/operation-forms?type=${formType}`); }
