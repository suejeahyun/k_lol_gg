import { AdminMediaEditorPage } from "@/components/admin/media/admin-media-pages";

function uploadCount(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[0-5]$/u.test(value)) return null;
  return Number(value);
}

export default async function Page({ params, searchParams }: { params: Promise<{ imageId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const uploaded = uploadCount(query.uploaded);
  const linked = uploadCount(query.linked);
  const failed = uploadCount(query.failed);
  const initialUploadReport = uploaded !== null && linked !== null && failed !== null && linked <= uploaded && uploaded + failed > 0
    ? { uploaded, linked, failed }
    : undefined;
  return <AdminMediaEditorPage kind="gallery" id={(await params).imageId} initialUploadReport={initialUploadReport} />;
}
