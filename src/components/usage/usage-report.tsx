import Link from "next/link";
import { kstDate, USAGE_ACTIONS, USAGE_ROUTES, type UsageRange } from "@/modules/usage/domain/usage";
import type { UsageReport } from "@/modules/usage/infrastructure/postgres-usage";
import styles from "./usage-report.module.css";
const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
const label = (value: string) => USAGE_ROUTES[value] ?? USAGE_ACTIONS[value as keyof typeof USAGE_ACTIONS] ?? value;

export function UsageReportView({ report, range, enabled }: { report: UsageReport; range: UsageRange; enabled: boolean }) {
  const first = report.coverage.firstEventAt ? kstDate(new Date(report.coverage.firstEventAt)) : null;
  const collected = report.daily.filter((day) => first && day.date >= first);
  const hasCoverage = collected.length > 0;
  const dailyAverage = collected.length ? collected.reduce((sum, day) => sum + day.browsers, 0) / collected.length : null;
  const s = report.summary;
  const max = Math.max(1, ...collected.map((day) => day.browsers));
  const pages = report.popular.filter((item) => item.kind === "page").slice(0, 5);
  const clicks = report.popular.filter((item) => item.kind === "click").slice(0, 10);
  return <>
    {!enabled && <p className={styles.notice} role="status">수집 꺼짐 · 저장된 기록만 표시 · 중단 기간 누락</p>}
    <p className={styles.notice}>{first ? `첫 수집일 ${first} · ${range.from < first ? "선택 기간에 미수집 날짜 포함" : "선택 기간 집계"}` : "방문 기록 미수집"} 첫 수집일·오늘은 부분 집계</p>
    <section className={styles.cards} aria-label="이용 현황 요약">
      {[
        ["등록 회원", `${number(s.registered)}명`, `현재 승인 회원 ${number(s.approved)}명 · 관리자·제외 계정 제외`],
        ["기간 내 이용 회원", hasCoverage ? `${number(s.members)}명` : "미수집", "로그인 회원 · 중복 제외"],
        ["승인 회원 이용률", hasCoverage && s.approved ? `${number(s.activeApproved / s.approved * 100)}%` : "—", "기간 내 이용 승인 회원 / 현재 승인 회원"],
        ["일평균 브라우저", dailyAverage === null ? "미수집" : `${number(dailyAverage)}개`, "수집일 기준 · 일별 중복 제외"],
        ["전체 브라우저", hasCoverage ? `${number(s.browsers)}개` : "미수집", "회원·비회원 · 기간 내 중복 제외"],
        ["비로그인 브라우저", hasCoverage ? `${number(s.guests)}개` : "미수집", "비회원·로그아웃 회원 포함"],
        ["방문 횟수", hasCoverage ? `${number(s.visits)}회` : "미수집", "30분 비활동 후 새 방문 집계"],
        ["페이지 조회", hasCoverage ? `${number(s.views)}회` : "미수집", "수집 대상 열람 수"],
        ["플레이어 검색", hasCoverage ? `${number(s.searches)}회` : "미수집", "검색어가 있는 결과 화면 조회 · 검색어 미저장"],
      ].map(([title, value, note]) => <article className={styles.card} key={title}><span>{title}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>
    <section className={styles.section}>
      <h2>회원들의 월 방문 빈도</h2>
      <p>해당 월 이용 회원 기준 · 선택 기간만 집계 · 미수집 날짜 제외</p>
      {report.monthly.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="이용 통계 표"><table><caption className={styles.srOnly}>월별 회원 방문 빈도</caption><thead><tr><th>월</th><th>범위</th><th>이용 회원</th><th>회원 방문</th><th>1인 평균</th><th>중앙값</th><th>평균 이용 일수</th><th>2일 이상 이용</th></tr></thead><tbody>
        {report.monthly.map((m) => {
          const monthEnd = new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5)), 0)).toISOString().slice(0, 10);
          const partial = range.from > `${m.month}-01` || range.to < monthEnd || kstDate(new Date()) <= monthEnd || (first !== null && first >= `${m.month}-01`) || !enabled;
          return <tr key={m.month}><th>{m.month}</th><td>{partial ? "부분 집계" : "선택 월 전체*"}</td><td>{number(m.members)}명</td><td>{number(m.visits)}회</td><td>{number(m.averageVisits)}회</td><td>{number(m.medianVisits)}회</td><td>{number(m.averageDays)}일</td><td>{number(m.returningMembers)}명 ({number(m.returningMembers / m.members * 100)}%)</td></tr>;
        })}
      </tbody></table></div> : <p className={styles.empty}>선택 기간에 수집된 회원 이용 기록이 없습니다.</p>}
      <small>* 수집 차단·장애·중단 시 방문 누락 가능</small>
    </section>
    <section className={styles.section}>
      <h2>일별 방문 현황</h2>
      <p>일별 중복 제외 · 로그인 전후 중복으로 회원 + 비회원 ≠ 전체</p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="이용 통계 표"><table><caption className={styles.srOnly}>일별 방문자와 페이지 조회</caption><thead><tr><th>날짜 (한국 시간)</th><th>전체 브라우저</th><th>회원</th><th>비회원 브라우저</th><th>방문</th><th>조회</th></tr></thead><tbody>
        {report.daily.map((d) => {
          const missing = !first || d.date < first;
          return <tr key={d.date}><th>{d.date}{d.date === kstDate(new Date()) ? " · 오늘" : ""}</th><td><span className={styles.bar} style={{ width: `${d.browsers / max * 70}%` }} />{missing ? "미수집" : number(d.browsers)}</td><td>{missing ? "—" : number(d.members)}</td><td>{missing ? "—" : number(d.guests)}</td><td>{missing ? "—" : number(d.visits)}</td><td>{missing ? "—" : number(d.views)}</td></tr>;
        })}
      </tbody></table></div>
    </section>
    <div className={styles.columns}>
      <section className={styles.section}><h2>많이 본 페이지 TOP 5</h2>
        {pages.length ? <ol className={styles.ranking}>{pages.map((p) => <li key={p.route}><strong>{label(p.route)}</strong><span>{number(p.events)}회 · 브라우저 {number(p.browsers)}개 · 회원 {number(p.members)}명</span></li>)}</ol> : <p className={styles.empty}>페이지 기록이 없습니다.</p>}
      </section>
      <section className={styles.section}><h2>주요 클릭</h2><p>클릭 수 · 기능 완료 수 아님</p>
        {clicks.length ? <ol className={styles.ranking}>{clicks.map((p) => <li key={`${p.route}:${p.target}`}><strong>{label(p.route)} → {label(p.target!)}</strong><span>{number(p.events)}회 · 브라우저 {number(p.browsers)}개 · 회원 {number(p.members)}명</span></li>)}</ol> : <p className={styles.empty}>클릭 기록이 없습니다.</p>}
      </section>
    </div>
    <section className={styles.section}><h2>자주 이어서 본 페이지</h2><p>같은 방문 내 연속 조회 · 목적·만족도 지표 아님</p>
      {report.paths.length ? <ol className={styles.ranking}>{report.paths.map((p) => <li key={`${p.from}:${p.to}`}><strong>{label(p.from)} → {label(p.to)}</strong><span>{number(p.transitions)}회 · 브라우저 {number(p.browsers)}개</span></li>)}</ol> : <p className={styles.empty}>연속 조회 기록이 없습니다.</p>}
    </section>
    <aside className={styles.notice}>관리자 로그인·테스트 계정·식별된 봇 제외 · 로그아웃 관리자·미식별 봇 포함 가능 · 기기·쿠키 변경 시 중복 가능 · 로그아웃 회원은 비회원 브라우저로 집계. <Link href="/privacy">수집 항목과 제외 설정</Link></aside>
  </>;
}
