export const dynamic = "force-dynamic";


import { prisma } from "@/lib/prisma/client";
import MatchForm from "@/features/match/MatchForm";
import { getKstDateKey, toKstDateTimeLocalInputValue } from "@/lib/date/kst";
import Link from "next/link";

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
}

export default async function NewMatchPage({ searchParams }: { searchParams: Promise<{ submissionId?: string }> }) {
  const submissionId = Number((await searchParams).submissionId);
  const [seasons, players, champions, submission] = await Promise.all([
    prisma.season.findMany({ orderBy: { id: "desc" } }),
    prisma.player.findMany({ orderBy: { id: "asc" } }),
    prisma.champion.findMany({ orderBy: { id: "asc" } }),
    Number.isInteger(submissionId) && submissionId > 0 ? prisma.inhouseResultSubmission.findUnique({ where: { id: submissionId }, include: { images: { orderBy: { gameNumber: "asc" } } } }) : null,
  ]);

const currentSeason =
  seasons.find((season: (typeof seasons)[number]) => season.isActive) ??
  seasons[0];

  const dateText = submission ? getKstDateKey(submission.matchDate) : "";
  return (<>
    {submission ? <section className="admin-card" style={{marginBottom:20}}><h2>카카오 결과 접수 {submission.publicCode}</h2><p>{submission.organizer} · {dateText} · {submission.seriesNumber}회차 · {submission.expectedGameCount}세트</p><div>{submission.images.map((image) => <Link key={image.id} target="_blank" className="admin-button admin-button--ghost" href={`/api/admin/private-assets/${image.privateAssetId}`}>{image.gameNumber}세트 사진</Link>)}</div></section> : null}
    <MatchForm
      mode="create"
      submitUrl="/api/matches"
      seasons={seasons.map((season: (typeof seasons)[number]) => ({
  id: season.id,
  name: season.name,
}))}
      players={players.map((player: (typeof players)[number]) => ({
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
      }))}
      champions={champions.map((champion: (typeof champions)[number]) => ({
        id: champion.id,
        name: champion.name,
      }))}
      initialData={{
        submissionId: submission?.id ?? null,
        initialGameCount: submission?.expectedGameCount ?? 0,
        seasonId: submission?.seasonId ?? currentSeason?.id ?? 1,
        title: submission ? `${dateText} ${ordinal(submission.seriesNumber)}` : "",
        matchDate: toKstDateTimeLocalInputValue(),
        teamBalanceDraftId: submission?.teamBalanceDraftId ?? null,
        games: [],
      }}
    />
  </>);
}
