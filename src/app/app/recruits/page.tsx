import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

function typeLabel(type: string) {
  if (type.includes("TEN")) return "10인";
  if (type.includes("EIGHT")) return "8인";
  if (type.includes("FIVE")) return "5인";
  if (type.includes("FOUR")) return "4인";
  if (type.includes("THREE")) return "3인";
  if (type.includes("TWO")) return "2인";
  return "파티";
}

export default async function AppRecruitsPage() {
  const allParties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
  });
  const parties = allParties;

  return (
    <AppMobileShell subtitle="구인 현황">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">RECRUIT</div>
        <h1 className="klol-app-title">구인 현황</h1>
      </section>

      <AppSection title="모집 중" caption={`${parties.length}개`}>
        {parties.length === 0 ? (
          <AppEmpty>현재 표시할 구인이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {parties.map((party) => {
              const memberCount = party.members.length;
              return (
                <article className="klol-app-list-card" key={party.id}>
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>#{party.recruitNo} · {party.title || typeLabel(party.type)}</strong>
                      <span>{party.startTimeText || "시간 미정"} · {party.note || party.tierText || "내용 미입력"}</span>
                    </div>
                    <span className="klol-app-badge">{memberCount}/{party.maxMembers}</span>
                  </div>
                  <div className="klol-app-meta-grid">
                    <div className="klol-app-meta">
                      <span>파티</span>
                      <strong>{typeLabel(party.type)}</strong>
                    </div>
                  </div>
                  <p className="klol-app-muted">
                    {party.members.map((member) => member.name).join(" · ") || "참가자 없음"}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
