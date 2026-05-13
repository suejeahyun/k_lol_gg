import DestructionParticipationClient from "./DestructionParticipationClient";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export default async function DestructionParticipationPage({ params }: PageProps) {
  const { tournamentId } = await params;

  return <DestructionParticipationClient tournamentId={tournamentId} />;
}
