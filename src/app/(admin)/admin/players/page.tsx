import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import PlayerDeleteButton from "./[playerId]/PlayerDeleteButton";

type AdminPlayersPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
  }>;
};

const PAGE_SIZE = 10;

export default async function AdminPlayersPage({
  searchParams,
}: AdminPlayersPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const query = resolvedSearchParams.q?.trim() ?? "";

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { nickname: { contains: query, mode: "insensitive" as const } },
          { tag: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const totalCount = await prisma.player.count({ where });

  const players = await prisma.player.findMany({
    where,
    orderBy: {
      id: "desc",
    },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <main className="page-container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          관리자 - 플레이어 목록
        </h1>

        <Link href="/admin/players/new" className="app-button">
          등록
        </Link>
      </div>

      {players.length === 0 ? (
        <p>등록된 플레이어가 없습니다.</p>
      ) : (
        <>
          <div className="player-row-header admin-player-row-header">
            <div>이름</div>
            <div>닉네임</div>
            <div>태그</div>
            <div>관리</div>
          </div>

          <div className="card-grid">
            {players.map((player: (typeof players)[number]) => (
              <div key={player.id} className="admin-player-row-card">
                <div className="admin-player-row-grid">
                  <div className="player-col player-name">{player.name}</div>
                  <div className="player-col">{player.nickname}</div>
                  <div className="player-col">{player.tag}</div>

                  <div className="admin-player-actions">
                    <Link
                      href={`/admin/players/${player.id}/edit`}
                      className="chip-button"
                    >
                      수정
                    </Link>

                    <PlayerDeleteButton playerId={player.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/admin/players"
            query={{ q: query }}
          />
        </>
      )}
    </main>
  );
}