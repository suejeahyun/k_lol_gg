import { AdminMediaEditorPage } from "@/components/admin/media/admin-media-pages";
export default async function Page({ params }: { params: Promise<{ highlightId: string }> }) { return <AdminMediaEditorPage kind="highlight" id={(await params).highlightId} />; }
