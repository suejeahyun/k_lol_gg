import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ draftId: string }> };

export default async function UserBalanceDraftRecommendationsPage({ params }: Props) {
  const { draftId } = await params;
  redirect(`/players/balance/recommendations?draftId=${draftId}&team=RED`);
}
