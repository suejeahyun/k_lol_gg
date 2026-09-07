import { AdminMediaEditorPage } from "@/components/admin/media/admin-media-pages";
export default async function Page({ params }: { params: Promise<{ imageId: string }> }) { return <AdminMediaEditorPage kind="gallery" id={(await params).imageId} />; }
