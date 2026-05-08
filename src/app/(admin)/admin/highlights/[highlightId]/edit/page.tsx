export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import HighlightForm from "@/features/highlight/HighlightForm";

type PageProps = {
  params: Promise<{
    highlightId: string;
  }>;
};

export default async function AdminEditHighlightPage({ params }: PageProps) {
  const { highlightId } = await params;
  const id = Number(highlightId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const highlight = await prisma.highlight.findUnique({
    where: { id },
  });

  if (!highlight) {
    notFound();
  }

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">하이라이트 수정</h1>
        </div>
      </div>

      <HighlightForm
        mode="edit"
        submitUrl={`/api/highlights/${highlight.id}`}
        method="PATCH"
        initialData={{
          title: highlight.title,
          description: highlight.description,
          youtubeUrl: highlight.youtubeUrl,
          thumbnailUrl: highlight.thumbnailUrl,
          isPublished: highlight.isPublished,
          sortOrder: highlight.sortOrder,
        }}
      />
    </main>
  );
}
