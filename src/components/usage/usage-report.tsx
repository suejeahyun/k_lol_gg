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
    {!enabled && <p className={styles.notice} role="status">현재 수집이 꺼져 있습니다. 아래는 저장된 기록이며, 수집 중단 기간에는 실제 이용이 누락될 수 있습니다.</p>}
    <p className={styles.notice}>{first ? `첫 수집일 ${first} · ${range.from < first ? "선택 기간에 미수집 날짜가 포함되어 있습니다." : "선택한 기간에 수집된 기록입니다."}` : "아직 수집된 방문 기록이 없습니다. 방문·클릭 수치는 미수집으로 표시합니다."} 오늘과 첫 수집일은 하루 중 일부만 포함됩니다.</p>
    <section className={styles.cards} aria-label="이용 현황 요약">
      {[
        ["등록 회원", `${number(s.registered)}명`, `현재 승인 회원 ${number(s.approved)}명 · 관리자·제외 계정 제외`],
        ["기간 내 이용 회원", hasCoverage ? `${number(s.members)}명` : "미수집", "로그인 상태로 이용한 고유 회원"],
        ["승인 회원 이용률", hasCoverage && s.approved ? `${number(s.activeApproved / s.approved * 100)}%` : "—", "현재 승인 회원 중 기간 내 이용한 비율"],
        ["일평균 방문자", dailyAverage === null ? "미수집" : `${number(dailyAverage)}개`, "수집일 기준 고유 브라우저 / 일 · 사람 수 추정치"],
        ["전체 방문자", hasCoverage ? `${number(s.browsers)}개` : "미수집", "회원·비회원 포함 · 중복 제거한 브라우저 수"],
        ["비로그인 방문자", hasCoverage ? `${number(s.guests)}개` : "미수집", "회원가입 없이 방문한 브라우저 포함 · 미로그인 회원도 포함"],
        ["방문 횟수", hasCoverage ? `${number(s.visits)}회` : "미수집", "30분 비활동 후 재이용하면 새 방문"],
        ["페이지 조회", hasCoverage ? `${number(s.views)}회` : "미수집", "수집 대상 페이지 열람 횟수"],
        ["플레이어 검색", hasCoverage ? `${number(s.searches)}회` : "미수집", "검색어가 있는 결과 화면 조회 · 검색어 미저장"],
      ].map(([title, value, note]) => <article className={styles.card} key={title}><span>{title}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>
    <section className={styles.section}>
      <h2>회원들의 월 방문 빈도</h2>
      <p>해당 월의 이용 회원 기준입니다. 선택 기간에 포함된 기록만 계산하며, 월 전체가 포함되지 않거나 첫 수집일 이후의 기록만 있으면 부분 집계입니다.</p>
      {report.monthly.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="이용 통계 표"><table><caption className={styles.srOnly}>월별 회원 방문 빈도</caption><thead><tr><th>월</th><th>범위</th><th>이용 회원</th><th>회원 방문</th><th>1인 평균</th><th>중앙값</th><th>평균 이용 일수</th><th>2일 이상 이용</th></tr></thead><tbody>
        {report.monthly.map((m) => {
          const monthEnd = new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5)), 0)).toISOString().slice(0, 10);
          const partial = range.from > `${m.month}-01` || range.to < monthEnd || kstDate(new Date()) <= monthEnd || (first !== null && first >= `${m.month}-01`) || !enabled;
          return <tr key={m.month}><th>{m.month}</th><td>{partial ? "부분 집계" : "선택 월 전체*"}</td><td>{number(m.members)}명</td><td>{number(m.visits)}회</td><td>{number(m.averageVisits)}회</td><td>{number(m.medianVisits)}회</td><td>{number(m.averageDays)}일</td><td>{number(m.returningMembers)}명 ({number(m.returningMembers / m.members * 100)}%)</td></tr>;
        })}
      </tbody></table></div> : <p className={styles.empty}>선택 기간에 수집된 회원 이용 기록이 없습니다.</p>}
      <small>* 수집 차단·장애·중단 중의 방문은 기록되지 않습니다. 월 전체 기간을 선택해도 전수 집계를 보장하지 않습니다.</small>
    </section>
    <section className={styles.section}>
      <h2>일별 방문 현황</h2>
      <p>브라우저 중복은 날짜별로 제거합니다. 로그인 전후 같은 브라우저가 포함될 수 있어 회원 수와 비회원 브라우저 수의 합은 전체와 다를 수 있습니다.</p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="이용 통계 표"><table><caption className={styles.srOnly}>일별 방문자와 페이지 조회</caption><thead><tr><th>날짜 (한국 시간)</th><th>전체 브라우저</th><th>회원</th><th>비회원 브라우저</th><th>방문</th><th>조회</th></tr></thead><tbody>
        {report.daily.map((d) => {
          const missing = !first || d.date < first;
          return <tr key={d.date}><th>{d.date}{d.date === kstDate(new Date()) ? " · 오늘" : ""}</th><td><span className={styles.bar} style={{ width: `${d.browsers / max * 70}%` }} />{missing ? "미수집" : number(d.browsers)}</td><td>{missing ? "—" : number(d.members)}</td><td>{missing ? "—" : number(d.guests)}</td><td>{missing ? "—" : number(d.visits)}</td><td>{missing ? "—" : number(d.views)}</td></tr>;
        })}
      </tbody></table></div>
    </section>
    <div className={styles.columns}>
      <section className={styles.section}><h2>많이 본 페이지 TOP 5</h2><p>어떤 정보를 찾았는지 추정할 수 있는 페이지 유형입니다.</p>
        {pages.length ? <ol className={styles.ranking}>{pages.map((p) => <li key={p.route}><strong>{label(p.route)}</strong><span>{number(p.events)}회 · 브라우저 {number(p.browsers)}개 · 회원 {number(p.members)}명</span></li>)}</ol> : <p className={styles.empty}>페이지 기록이 없습니다.</p>}
      </section>
      <section className={styles.section}><h2>주요 클릭</h2><p>메뉴·링크와 계측된 기능 버튼입니다. 클릭은 기능 완료를 뜻하지 않습니다.</p>
        {clicks.length ? <ol className={styles.ranking}>{clicks.map((p) => <li key={`${p.route}:${p.target}`}><strong>{label(p.route)} → {label(p.target!)}</strong><span>{number(p.events)}회 · 브라우저 {number(p.browsers)}개 · 회원 {number(p.members)}명</span></li>)}</ol> : <p className={styles.empty}>클릭 기록이 없습니다.</p>}
      </section>
    </div>
    <section className={styles.section}><h2>자주 이어서 본 페이지</h2><p>같은 방문 안에서 연속으로 본 페이지입니다. 방문 목적과 정보 만족도를 확정하는 지표는 아닙니다.</p>
      {report.paths.length ? <ol className={styles.ranking}>{report.paths.map((p) => <li key={`${p.from}:${p.to}`}><strong>{label(p.from)} → {label(p.to)}</strong><span>{number(p.transitions)}회 · 브라우저 {number(p.browsers)}개</span></li>)}</ol> : <p className={styles.empty}>연속 조회 기록이 없습니다.</p>}
    </section>
    <aside className={styles.notice}>관리자 로그인·테스트 계정·식별 가능한 봇은 제외합니다. 로그아웃한 관리자, 식별되지 않는 봇, 기기 변경·쿠키 삭제에 따른 중복까지 완전히 구별할 수는 없습니다. 비로그인 상태의 회원은 비회원 브라우저로 집계합니다. <Link href="/privacy">수집 항목과 제외 설정</Link></aside>
  </>;
}
