import PrivateAssetViewer from "@/components/admin/PrivateAssetViewer";

export const dynamic = "force-dynamic";

export default async function PrivateAssetViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PrivateAssetViewer assetId={id} />;
}
