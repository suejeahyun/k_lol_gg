export const dynamic = "force-dynamic";

import KakaoOperationFormAdminPage from "@/components/admin/KakaoOperationFormAdminPage";

export default function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return <KakaoOperationFormAdminPage type="friends" searchParams={searchParams} />;
}
