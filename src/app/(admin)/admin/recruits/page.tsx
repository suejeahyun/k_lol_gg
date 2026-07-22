export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Prisma } from "@prisma/client";
import Pagination from "@/components/Pagination";
import { parsePositivePage } from "@/lib/http/pagination";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import AdminRecruitResetAllButton from "./AdminRecruitResetAllButton";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { runRecruitIdleAutoFinishIfNeeded } from "@/lib/kakao/recruit-idle-auto-finish";
import { prisma } from "@/lib/prisma/client";
import { getSiteSettings } from "@/lib/site/settings";
import {
  buildGameInfoText,
  getActiveMemberCount,
  getRecruitStatusLabel,
  getRecruitTypeLabel,
} from "@/lib/kakao/party-recruit";

type PageSearchParams = {
  page?: string;
  q?: string;
  date?: string;
};

type PageProps = {
  searchParams: Promise<PageSearchParams>;
};

const PAGE_SIZE = 20;
const RECENT_LOG_LIMIT = 10;

function formatKstDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildPartyWhere(searchParams: PageSearchParams): Prisma.RecruitPartyWhereInput {
  const q = String(searchParams.q ?? "").trim();
  const date = String(searchParams.date ?? "").trim();
  const and: Prisma.RecruitPartyWhereInput[] = [{ status: "IN_PROGRESS" }];

  if (date) {
    and.push({ recruitDate: date });
  }

  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { recruitCode: { contains: q, mode: "insensitive" } },
        { roomName: { contains: q, mode: "insensitive" } },
        { hostName: { contains: q, mode: "insensitive" } },
        { members: { some: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  return { AND: and };
}

function buildLogWhere(searchParams: PageSearchParams): Prisma.RecruitPartyLogWhereInput {
  const q = String(searchParams.q ?? "").trim();
  const date = String(searchParams.date ?? "").trim();
  const and: Prisma.RecruitPartyLogWhereInput[] = [];

  if (date) {
    and.push({ recruitDate: date });
  }

  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { roomName: { contains: q, mode: "insensitive" } },
        { sender: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export default async function AdminRecruitsPage({ searchParams }: PageProps) {
  const admin = await requireAdminRequest();
  const isSuperAdmin = admin?.user.role === "SUPER_ADMIN";
  const siteSettings = await getSiteSettings();
  const resolvedSearchParams = await searchParams;
  const safePage = parsePositivePage(resolvedSearchParams.page);
  const q = resolvedSearchParams.q ?? "";
  const date = resolvedSearchParams.date ?? "";
  await runRecruitIdleAutoFinishIfNeeded({ source: "admin-recruits-page", roomName: "admin", sender: "admin" });

  const where = buildPartyWhere(resolvedSearchParams);
  const logWhere = buildLogWhere(resolvedSearchParams);

  const [totalCount, activeCount, fullCount, logTotalCount, parties, recentLogs] = await Promise.all([
    prisma.recruitParty.count({ where }),
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }),
    prisma.recruitParty.count({
      where: {
        status: "IN_PROGRESS",
        members: { some: { name: { not: "" } } },
      },
    }),
    prisma.recruitPartyLog.count({ where: logWhere }),
    prisma.recruitParty.findMany({
      where,
      include: {
        members: {
          orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.recruitPartyLog.findMany({
      where: logWhere,
      orderBy: [{ createdAt: "desc" }],
      take: RECENT_LOG_LIMIT,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginationQuery = {
    q: q || undefined,
    date: date || undefined,
  };

  return (
    <PremiumFeatureGate feature="recruit" settings={siteSettings}>
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">KAKAO RECRUIT</p>
          <h1>카카오 구인구직 관리</h1>
        </div>
        <div className="admin-actions">
          <a className="admin-button admin-button--ghost" href="/admin/recruits/settings">설정</a>
          <a className="admin-button admin-button--ghost" href="/admin/recruits/logs">기록</a>
        </div>
      </div>

      <section className="card-grid">
        <div className="stat-card">
          <span className="stat-card__label">전체 진행 중</span>
          <strong className="stat-card__value">{activeCount.toLocaleString("ko-KR")}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">현재 조회 결과</span>
          <strong className="stat-card__value">{totalCount.toLocaleString("ko-KR")}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">참가자 입력 있음</span>
          <strong className="stat-card__value">{fullCount.toLocaleString("ko-KR")}</strong>
        </div>
      </section>

      <form className="admin-filter-bar admin-filter-bar--grid" action="/admin/recruits">
        <input aria-label="제목, 방, 생성자, 참가자 검색" name="q" defaultValue={q} placeholder="제목, 방, 생성자, 참가자 검색" className="admin-input" />
        <input aria-label="조회 날짜" name="date" defaultValue={date} type="date" className="admin-input" />
        <button className="admin-button" type="submit">조회</button>
        <a className="admin-button admin-button--ghost" href="/admin/recruits">검색조건 초기화</a>
      </form>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>진행 중 구인글</h2>
            <p className="admin-muted">총 {totalCount.toLocaleString("ko-KR")}개</p>
          </div>
          <div className="admin-recruit-actions">
            {isSuperAdmin ? <AdminRecruitResetAllButton /> : null}
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>날짜/회차</th>
                <th>번호</th>
                <th>관리번호</th>
                <th>유형</th>
                <th>제목</th>
                <th>인원</th>
                <th>게임정보</th>
                <th>방/생성자</th>
                <th>수정일</th>
              </tr>
            </thead>
            <tbody>
              {parties.length === 0 ? (
                <tr>
                  <td colSpan={9}>조건에 맞는 진행 중 구인글이 없습니다.</td>
                </tr>
              ) : (
                parties.map((party) => {
                  const activeMembers = getActiveMemberCount(party.members);
                  const statusLabel = getRecruitStatusLabel(party);
                  const gameInfo = buildGameInfoText(party) || "-";
                  return (
                    <tr key={party.id}>
                      <td>{party.recruitDate} / {party.resetSeq}</td>
                      <td>#{party.recruitNo}</td>
                      <td>{party.recruitCode || `${party.recruitDate}-${party.maxMembers}-${party.recruitNo}`}</td>
                      <td>{getRecruitTypeLabel(party.type)}</td>
                      <td>
                        <strong>{party.title}</strong>
                        <div className="admin-muted">{statusLabel}</div>
                      </td>
                      <td>{activeMembers}/{party.maxMembers}</td>
                      <td>{gameInfo}</td>
                      <td>
                        <div>{party.roomName || "-"}</div>
                        <div className="admin-muted">{party.hostName || "-"}</div>
                      </td>
                      <td>{formatKstDateTime(party.updatedAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={Math.min(safePage, totalPages)}
          totalPages={totalPages}
          basePath="/admin/recruits"
          query={paginationQuery}
        />
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>최근 구인구직 기록</h2>
            <p className="admin-muted">최근 {RECENT_LOG_LIMIT}건 · 전체 {logTotalCount.toLocaleString("ko-KR")}건</p>
          </div>
          <a className="admin-button admin-button--ghost" href="/admin/recruits/logs">전체 기록</a>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>날짜/회차</th>
                <th>번호</th>
                <th>액션</th>
                <th>제목</th>
                <th>인원</th>
                <th>방/처리자</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={7}>구인구직 기록이 없습니다.</td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatKstDateTime(log.createdAt)}</td>
                    <td>{log.recruitDate || "-"} / {log.resetSeq}</td>
                    <td>{log.recruitNo > 0 ? `#${log.recruitNo}` : "-"}</td>
                    <td><span className="admin-log-action-pill">{log.action}</span></td>
                    <td>{log.title}</td>
                    <td>{log.memberCount}/{log.maxMembers}</td>
                    <td>
                      <div>{log.roomName || "-"}</div>
                      <div className="admin-muted">{log.sender || "-"}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
    </PremiumFeatureGate>
  );
}
