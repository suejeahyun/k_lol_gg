import { AdminMediaListPage } from "@/components/admin/media/admin-media-pages";
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <AdminMediaListPage kind="gallery" searchParams={searchParams} />; }
