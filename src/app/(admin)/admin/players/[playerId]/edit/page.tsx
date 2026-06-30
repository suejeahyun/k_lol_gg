import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ playerId: string }>;
};

export default async function AdminPlayerEditRedirectPage({ params }: Props) {
  const { playerId } = await params;
  redirect(`/admin/players/${playerId}`);
}
