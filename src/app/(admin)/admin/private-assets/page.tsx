import { AdminPrivateAssetListPage } from "@/components/admin/media/admin-private-asset-pages";

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AdminPrivateAssetListPage searchParams={searchParams} />;
}
