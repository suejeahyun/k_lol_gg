import Link from "next/link";
import { notFound } from "next/navigation";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

type AppDestructionDetailPageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function statusText(status: string) {
  if (status === "PLANNED") return "예정";
  if (status === "RECRUITING") return "모집중";
  if (status === "TEAM_BUILDING") return "팀 구성";
  if (status === "AUCTION") return "경매";
  if (status === "PRELIMINARY") return "예선";
  if (status === "TOURNAMENT") return "본선";
  if (status === "COMPLETED") return "완료";
  if (status === "CANCELLED") return "취소";
  return status;
}

function auctionText(status: string) {
  if (status === "PENDING") return "대기";
  if (status === "DRAWN") return "추첨";
  if (status === "SOLD") return "낙찰";
  if (status === "HOLD") return "보류";
  if (status === "ASSIGNED") return "배정";
  return status;
}

function positionText(position?: string | null) {
  return position ?? "-";
}

export default async function AppDestructionDetailPage({ params }: AppDestructionDetailPageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const tournament = await prisma.destructionTournament.findUnique({
    where: { id },
    include: {
      teams: {
        include: {
          captain: true,
          members: {
            include: { player: true },
            orderBy: [{ position: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ preliminaryGroup: "asc" }, { id: "asc" }],
      },
      participants: {
        include: { player: true, team: true },
        orderBy: [{ isCaptain: "desc" }, { position: "asc" }, { id: "asc" }],
        take: 30,
      },
      matches: {
        include: { teamA: true, teamB: true },
        orderBy: [{ stage: "asc" }, { round: "asc" }],
        take: 16,
      },
    },
  });

  if (!tournament) notFound();

  const auctionSummary = tournament.participants.reduce(
    (acc, participant) => {
      const key = participant.auctionStatus;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <AppMobileShell subtitle="멸망전">
      <section className="klol-app-hero klol-app-event-detail-hero klol-app-event-detail-hero--destruction">
        <div className="klol-app-kicker">DESTRUCTION MATCH</div>
        <h1 className="klol-app-title">{tournament.title}</h1>
        <div className="klol-app-actions klol-app-actions--keep">
          <Link className="klol-app-secondary" href="/app/matches?tab=events">
            목록
          </Link>
        </div>
      </section>

      <AppSection title="진행 요약">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>상태</span>
            <strong>{statusText(tournament.status)}</strong>
          </div>
          <div className="klol-app-meta">
            <span>시작</span>
            <strong>{tournament.startDate ? dateFormatter.format(tournament.startDate) : "미정"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>참가자</span>
            <strong>{tournament.participants.length}명</strong>
          </div>
          <div className="klol-app-meta">
            <span>팀/경기</span>
            <strong>{tournament.teams.length}팀 · {tournament.matches.length}경기</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="경매 현황">
        <div className="klol-app-meta-grid">
          {["PENDING", "DRAWN", "SOLD", "HOLD"].map((status) => (
            <div className="klol-app-meta" key={status}>
              <span>{auctionText(status)}</span>
              <strong>{auctionSummary[status] ?? 0}명</strong>
            </div>
          ))}
        </div>
      </AppSection>

      <AppSection title="팀 구성">
        {tournament.teams.length === 0 ? (
          <AppEmpty>아직 구성된 팀이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {tournament.teams.map((team) => (
              <article className="klol-app-list-card klol-app-event-team" key={team.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{team.name}</strong>
                    <span>주장 {team.captain.name} · {team.members.length}명</span>
                  </span>
                  <span className="klol-app-badge">{team.points}점</span>
                </div>
                <p className="klol-app-muted">
                  {team.members.map((member) => `${positionText(member.position)} ${member.player.name}`).join(" · ") || "팀원 없음"}
                </p>
              </article>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title="참가자">
        {tournament.participants.length === 0 ? (
          <AppEmpty>참가자가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {tournament.participants.map((participant) => (
              <article className="klol-app-list-card" key={participant.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{participant.player.name}</strong>
                    <span>{participant.player.nickname}#{participant.player.tag}</span>
                  </span>
                  <span className="klol-app-badge">
                    {participant.isCaptain ? "주장" : auctionText(participant.auctionStatus)}
                  </span>
                </div>
                <p className="klol-app-muted">
                  {positionText(participant.position)}
                  {participant.purchasePoint ? ` · ${participant.purchasePoint}P` : ""}
                  {participant.team ? ` · ${participant.team.name}` : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title="예선·본선">
        {tournament.matches.length === 0 ? (
          <AppEmpty>등록된 경기가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {tournament.matches.map((match) => (
              <article className="klol-app-list-card" key={match.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{match.teamA.name} vs {match.teamB.name}</strong>
                    <span>{match.stage} · ROUND {match.round} · BO{match.bestOf}</span>
                  </span>
                  <span className="klol-app-badge">
                    {match.isConfirmed ? `${match.teamAScore}:${match.teamBScore}` : "대기"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
