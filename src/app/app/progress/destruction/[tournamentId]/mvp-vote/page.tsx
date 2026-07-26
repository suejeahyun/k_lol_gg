export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import DestructionMvpVoteHub from "@/components/destruction/DestructionMvpVoteHub";

export const metadata: Metadata = {
  title: "멸망전 MVP 투표",
  description: "해당 멸망전의 경기별 MVP 투표에 모바일에서 참여하세요.",
};

type PageProps = {
  params: Promise<{ tournamentId: string }>;
};

export default async function AppDestructionMvpVotePage({ params }: PageProps) {
  const tournamentId = Number((await params).tournamentId);
  return (
    <AppMobileShell subtitle="멸망전 MVP 투표">
      <DestructionMvpVoteHub tournamentId={tournamentId} appMode />
    </AppMobileShell>
  );
}
