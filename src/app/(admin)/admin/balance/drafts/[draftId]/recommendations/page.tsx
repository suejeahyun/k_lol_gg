import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ draftId: string }> };

export default async function AdminBalanceDraftRecommendationsPage({ params }: Props) {
  const { draftId } = await params;
  redirect(`/admin/balance/drafts/${draftId}`);
}
