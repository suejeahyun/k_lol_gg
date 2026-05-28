import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ draftId: string }> };

export default async function UserBalanceDraftDetailPage({ params }: Props) {
  const { draftId } = await params;
  redirect(`/players/balance/recommendations?draftId=${draftId}&team=RED`);
}
