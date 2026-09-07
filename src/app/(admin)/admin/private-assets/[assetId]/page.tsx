import { AdminPrivateAssetDetailPage } from "@/components/admin/media/admin-private-asset-pages";

export default async function Page({ params }: { params: Promise<{ assetId: string }> }) {
  return <AdminPrivateAssetDetailPage assetId={(await params).assetId} />;
}
