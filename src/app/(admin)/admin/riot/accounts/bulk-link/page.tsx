export const dynamic = "force-dynamic";

import Link from "next/link";
import AdminRiotBulkLinkControls from "@/components/riot/AdminRiotBulkLinkControls";
import { getRiotBulkLinkPreview } from "@/lib/riot/bulk-link";
import { getRiotFeatureStatus } from "@/lib/riot/feature";
import styles from "../../page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams?: Promise<SearchParams> };

function getString(params: SearchParams, key: string, fallback = "") {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function getNumber(params: SearchParams, key: string, fallback: number, min: number, max: number) {
  const parsed = Number(getString(params, key, String(fallback)));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function AdminRiotBulkLinkPage(props: PageProps) {
  const params = (await props.searchParams) ?? {};
  const q = getString(params, "q").trim();
  const batchSize = getNumber(params, "batchSize", 10, 1, 30);
  const feature = getRiotFeatureStatus();
  const preview = await getRiotBulkLinkPreview({ q, batchSize });
  const linkRate = preview.totalActivePlayers > 0
    ? Number(((preview.linkedAccounts / preview.totalActivePlayers) * 100).toFixed(1))
    : 0;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>RIOT BULK LINK</p>
          <h1 className={styles.title}>Riot 계정 일괄 연결</h1>
          <p className={styles.desc}>
            활성 플레이어 중 Riot 미연동자를 대상으로 사이트 닉네임#태그를 Riot ID로 사용해 PUUID를 조회하고 계정을 일괄 연결합니다. 전체 실행은 최고 관리자만 가능합니다.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/admin/riot">대시보드</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/accounts">계정 목록</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/sync">동기화</Link>
          <Link className={styles.secondaryButton} href="/admin/riot/logs">로그</Link>
        </div>
      </div>

      <section className={`${styles.statusBanner} ${feature.enabled ? styles.statusBannerEnabled : ""}`}>
        <div>
          <strong>{feature.enabled ? "일괄 연결 실행 가능" : "일괄 연결 차단"}</strong>
          <p>{feature.message}</p>
        </div>
        <span className={feature.enabled ? styles.badgeGreen : styles.badgeYellow}>{feature.enabled ? "ENABLED" : "FEATURE FLAG OFF"}</span>
      </section>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>활성 플레이어</span><strong>{preview.totalActivePlayers.toLocaleString("ko-KR")}</strong><em>isActive 기준</em></div>
        <div className={styles.kpiCard}><span>연결 완료</span><strong>{preview.linkedAccounts.toLocaleString("ko-KR")}</strong><em>연결률 {linkRate}%</em></div>
        <div className={styles.kpiCard}><span>미연동 후보</span><strong>{preview.totalCandidates.toLocaleString("ko-KR")}</strong><em>검색 조건 기준</em></div>
        <div className={styles.kpiCard}><span>이번 배치</span><strong>{preview.candidates.length.toLocaleString("ko-KR")}</strong><em>최대 {preview.batchSize}명</em></div>
      </section>

      <form className={styles.filterCard} method="get">
        <div className={styles.filterGrid}>
          <label>검색<input name="q" defaultValue={q} placeholder="이름, 닉네임, 태그" /></label>
          <label>미리보기 인원<select name="batchSize" defaultValue={String(batchSize)}><option value="5">5명</option><option value="10">10명</option><option value="20">20명</option><option value="30">30명</option></select></label>
          <button className={styles.primaryButton} type="submit">미리보기 갱신</button>
        </div>
      </form>

      <AdminRiotBulkLinkControls featureEnabled={feature.enabled} initialQ={q} initialBatchSize={batchSize} />

      <section className={styles.noticeCard}>
        <h2>운영 기준</h2>
        <p>
          이 기능은 관리자가 보유한 플레이어 닉네임#태그를 기준으로 Riot 계정이 존재하는지 확인하고 연결하는 도구입니다. 유저가 직접 Riot 계정 소유를 확인하는 OAuth/RSO 인증과는 다릅니다. 실패 계정은 태그 오류, 닉네임 변경, 중복 PUUID, Riot API 404/429를 기준으로 로그에서 확인하세요.
        </p>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h2>이번 배치 미리보기</h2>
            <p>아래 순서대로 처리됩니다. 닉네임#태그가 Riot ID와 다르면 실패 목록에 남습니다.</p>
          </div>
          <span className={styles.tableMeta}>후보 {preview.totalCandidates.toLocaleString("ko-KR")}명</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col style={{ width: "110px" }} />
              <col style={{ width: "190px" }} />
              <col style={{ width: "210px" }} />
              <col />
              <col style={{ width: "150px" }} />
            </colgroup>
            <thead>
              <tr><th>ID</th><th>플레이어</th><th>예상 Riot ID</th><th>처리 상태</th><th>등록일</th></tr>
            </thead>
            <tbody>
              {preview.candidates.length === 0 ? (
                <tr><td colSpan={5}><div className={styles.empty}>일괄 연결 대상이 없습니다.</div></td></tr>
              ) : preview.candidates.map((candidate) => (
                <tr key={candidate.playerId}>
                  <td className={styles.mono}>#{candidate.playerId}</td>
                  <td><Link className={styles.playerCell} href={`/admin/players/${candidate.playerId}`}><strong>{candidate.name}</strong><span>{candidate.nickname}#{candidate.tag}</span></Link></td>
                  <td><strong>{candidate.riotId}</strong></td>
                  <td><span className={styles.badgeYellow}>실행 대기</span></td>
                  <td>{formatDate(candidate.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
