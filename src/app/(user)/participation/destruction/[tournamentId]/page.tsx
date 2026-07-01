import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export default async function DestructionParticipationPage({ params }: PageProps) {
  const { tournamentId } = await params;

  redirect(`/progress/destruction/${tournamentId}`);
}
