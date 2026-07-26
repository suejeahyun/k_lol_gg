export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import DestructionMvpVoteHub from "@/components/destruction/DestructionMvpVoteHub";

type PageProps = {
  params: Promise<{ tournamentId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tournamentId } = await params;
  return {
    title: "멸망전 MVP 투표",
    description: "해당 멸망전의 예선과 본선 경기별 MVP 투표에 참여하세요.",
    alternates: {
      canonical: `/progress/destruction/${tournamentId}/mvp-vote`,
    },
  };
}

export default async function DestructionMvpVotePage({ params }: PageProps) {
  const tournamentId = Number((await params).tournamentId);
  return (
    <main className="page-container destruction-mvp-vote-page">
      <DestructionMvpVoteHub tournamentId={tournamentId} />
    </main>
  );
}
