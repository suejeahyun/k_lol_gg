"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Treemap,
  흐름Chart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./page.module.css";

const COLORS = ["#38bdf8", "#60a5fa", "#818cf8", "#2dd4bf", "#a78bfa", "#f59e0b", "#f87171", "#34d399"];

type Props = { data: any };

function numberFormat(value: number) {
  return new Intl.NumberFormat("ko-KR").format(Number(value || 0));
}
function displayLabel(value: unknown) {
  const raw = String(value ?? "미지정").trim() || "미지정";
  const key = raw.toUpperCase();
  const exact: Record<string, string> = {
    ADMIN_LOGIN: "관리자 로그인",
    USER_LOGIN: "유저 로그인",
    USER_LOGOUT: "유저 로그아웃",
    DISCORD_LOGIN_REFRESHED: "디스코드 로그인 갱신",
    DISCORD_LINKED_BY_USER: "디스코드 계정 연동",
    DISCORD_UNLINKED_BY_USER: "디스코드 연동 해제",
    KAKAO_PARTY_RECRUIT_SYNC: "카카오 구인 동기화",
    KAKAO_PARTY_RECRUIT_CREATE: "카카오 구인 생성",
    KAKAO_PARTY_RECRUIT_FINISH: "카카오 구인 마감",
    KAKAO_RECRUIT_SEASON_APPLY: "카카오 내전 참가신청",
    AUTO_IDLE_FINISH: "활동 없음 자동마감",
    AUTO_IDLE_RESET: "활동 없음 자동초기화",
    BACKUP_CSV_DOWNLOAD: "CSV 백업 다운로드",
    PLAYER_UPDATE: "플레이어 수정",
    PLAYER_DEACTIVATE: "플레이어 비활성화",
    DESTRUCTION_AUCTION_DRAW: "멸망전 경매 추첨",
    DESTRUCTION_AUCTION_HOLD: "멸망전 경매 보류",
    DESTRUCTION_PARTICIPATION_APPLY: "멸망전 참가 신청",
    BALANCE_RECOMMENDATION: "밸런스 추천",
    RECRUIT_CREATE: "구인 생성",
    RECRUIT_JOIN: "구인 참가",
    RECRUIT_FINISH: "구인 마감",
    RECRUIT_RESET: "구인 초기화",
    AUTO_FINISH: "자동 마감",
    CREATE: "생성",
    UPDATE: "수정",
    DELETE: "삭제",
    LOGIN: "로그인",
    DOWNLOAD: "다운로드",
    OTHER: "기타",
    UNKNOWN: "미분류",
    OPEN: "모집중",
    WAITING: "대기중",
    ACTIVE: "진행중",
    FINISHED: "마감",
    CANCELLED: "취소",
    RecruitParty: "구인",
    RecruitPartyLog: "구인 로그",
    UserAccount: "계정",
    Season: "시즌",
    BackupCsv: "백업 CSV",
    DestructionTournament: "멸망전",
  };
  if (exact[raw]) return exact[raw];
  if (exact[key]) return exact[key];
  if (key.includes("KAKAO")) return "카카오톡 작업";
  if (key.includes("DISCORD")) return "디스코드 작업";
  if (key.includes("LOGIN")) return "로그인";
  if (key.includes("LOGOUT")) return "로그아웃";
  if (key.includes("CREATE") || key.includes("APPLY")) return "생성/신청";
  if (key.includes("UPDATE") || key.includes("EDIT") || key.includes("SYNC")) return "수정/동기화";
  if (key.includes("DELETE") || key.includes("REMOVE")) return "삭제";
  if (key.includes("FINISH")) return "마감";
  if (key.includes("RESET")) return "초기화";
  if (key.includes("AUTO")) return "자동 처리";
  return raw;
}

function localizeList<T extends { name?: unknown; count?: number; value?: number }>(items: T[] = []) {
  return items.map((item) => ({ ...item, name: displayLabel(item.name) }));
}

function KpiCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <article className={styles.kpiCard}><span>{label}</span><strong>{typeof value === "number" ? numberFormat(value) : value}</strong>{hint ? <small>{hint}</small> : null}</article>;
}

function ChartCard({ title, desc, children, tall = false }: { title: string; desc?: string; children: React.ReactNode; tall?: boolean }) {
  return <section className={`${styles.chartCard} ${tall ? styles.tall : ""}`}><div className={styles.chartHeader}><h2>{title}</h2>{desc ? <p>{desc}</p> : null}</div><div className={styles.chartBody}>{children}</div></section>;
}

function EmptyAware({ data, children }: { data: any[]; children: React.ReactNode }) {
  if (!Array.isArray(data) || data.length === 0) return <div className={styles.empty}>표시할 데이터가 없습니다.</div>;
  return <>{children}</>;
}

function Donut({ data }: { data: any[] }) {
  return <EmptyAware data={displayData}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={displayData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>{displayData.map((_: any, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value: any) => numberFormat(value)} /><Legend /></PieChart></ResponsiveContainer></EmptyAware>;
}

function TopList({ data }: { data: { name: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return <EmptyAware data={displayData}><div className={styles.topList}>{data.map((item, index) => <div className={styles.topRow} key={`${item.name}-${index}`}><span className={styles.rank}>{index + 1}</span><span className={styles.topName} title={String(item.name)}>{displayLabel(item.name)}</span><div className={styles.barTrack}><i style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} /></div><strong>{numberFormat(item.count)}</strong></div>)}</div></EmptyAware>;
}

function 열지도({ data }: { data: { day: string; hour: number; count: number }[] }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  const days = ["월", "화", "수", "목", "금", "토", "일"];
  return <div className={styles.열지도}><div className={styles.열지도Grid}><span />{Array.from({ length: 24 }).map((_, hour) => <b key={hour}>{hour}</b>)}{days.map((day) => <div className={styles.열지도Row} key={day}><strong>{day}</strong>{Array.from({ length: 24 }).map((_, hour) => { const count = data.find((item) => item.day === day && item.hour === hour)?.count ?? 0; const level = Math.ceil((count / max) * 5); return <span key={`${day}-${hour}`} className={styles[`heat${level}`]} title={`${day} ${hour}시: ${count}건`} />; })}</div>)}</div></div>;
}

export default function KakaoStatsDashboard({ data }: Props) {
  const statusKeys: string[] = data.statusStackedKeys ?? [];
  const radarSubjects = Array.from(new Set((data.roomRadar ?? []).map((item: any) => item.subject)));
  const radarRooms = Array.from(new Set((data.roomRadar ?? []).map((item: any) => item.room)));
  const radarData = radarSubjects.map((subject: any) => { const row: any = { subject }; radarRooms.forEach((room: any) => { row[room] = (data.roomRadar ?? []).find((item: any) => item.subject === subject && item.room === room)?.value ?? 0; }); return row; });

  return (
    <div className={styles.dashboard}>
      <section className={styles.kpiGrid}>
        <KpiCard label="전체 활동" value={data.summary.totalActivities} hint={`${data.days}일 기준`} />
        <KpiCard label="구인 생성" value={data.summary.recruitCreates} hint="생성 계열" />
        <KpiCard label="자동 처리" value={data.summary.autoFinishes} hint="자동/초기화 계열" />
        <KpiCard label="참가신청" value={data.summary.seasonApply} hint="카카오 내전" />
        <KpiCard label="운영신청" value={data.summary.operationForms} hint="폼 접수" />
        <KpiCard label="활성 방" value={data.summary.activeRooms} hint="방 이름 기준" />
        <KpiCard label="고유 발신자" value={data.summary.uniqueSenders} hint="발신자 기준" />
        <KpiCard label="예비 신청" value={data.summary.reserveApply} hint="예비 여부 기준" />
      </section>

      <section className={styles.gridTwoWide}>
        <ChartCard title="일자별 카카오 활동" desc="전체 활동, 구인, 자동 처리를 함께 표시합니다." tall>
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.dailyTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(value: any) => numberFormat(value)} /><Legend /><Bar dataKey="count" name="전체 활동" fill="#38bdf8" radius={[6, 6, 0, 0]} /><Line type="monotone" dataKey="recruits" name="구인" stroke="#f59e0b" strokeWidth={2} /><Area type="monotone" dataKey="auto" name="자동처리" stroke="#818cf8" fill="#818cf8" fillOpacity={0.18} /></ComposedChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="구인 상태 비율" desc="구인 상태 기준입니다." tall><Donut data={data.statusDonut} /></ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="구인 흐름 흐름" desc="생성→참가→진행→마감→자동처리 흐름입니다.">
          <EmptyAware data={data.흐름}><ResponsiveContainer width="100%" height="100%"><TreemapChart><Tooltip formatter={(value: any) => numberFormat(value)} /><Treemap dataKey="value" data={data.흐름} isAnimationActive><LabelList position="right" fill="#e5f4ff" stroke="none" dataKey="name" /></Treemap></흐름Chart></ResponsiveContainer></EmptyAware>
        </ChartCard>
        <ChartCard title="구인 종류 비율" desc="구인 종류 기준입니다."><Donut data={data.typeDonut} /></ChartCard>
      </section>

      <section className={styles.gridThree}>
        <ChartCard title="액션 TOP 10"><TopList data={data.actionTop} /></ChartCard>
        <ChartCard title="방별 활동 TOP 10"><TopList data={data.roomTop} /></ChartCard>
        <ChartCard title="발신자 TOP 10"><TopList data={data.senderTop} /></ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="시간대별 활동" desc="카카오 활동이 몰리는 시간입니다.">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.hourlyTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" interval={2} /><YAxis /><Tooltip formatter={(value: any) => numberFormat(value)} /><Area type="monotone" dataKey="count" name="활동" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.3} /></AreaChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="방별 활동 비중 지도" desc="방별 활동량 비중입니다.">
          <EmptyAware data={data.room비중 지도}><ResponsiveContainer width="100%" height="100%"><Treemap data={data.room비중 지도} dataKey="size" nameKey="name" stroke="#0f2745" fill="#38bdf8" /></ResponsiveContainer></EmptyAware>
        </ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="요일 × 시간대 열지도" desc="색이 진할수록 활동이 많은 구간입니다."><Treemap data={data.열지도} /></ChartCard>
        <ChartCard title="방별 활동 성향" desc="상위 방 기준 액션 유형 분포입니다.">
          <EmptyAware data={radarData}><ResponsiveContainer width="100%" height="100%"><RadarChart data={radarData}><PolarGrid /><PolarAngleAxis dataKey="subject" /><PolarRadiusAxis />{radarRooms.slice(0, 5).map((room: any, index) => <Radar key={room} name={room} dataKey={room} stroke={COLORS[index % COLORS.length]} fill={COLORS[index % COLORS.length]} fillOpacity={0.12} />)}<Legend /><Tooltip /></RadarChart></ResponsiveContainer></EmptyAware>
        </ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="날짜별 구인 상태 구성" desc="상위 status가 날짜별로 어떻게 쌓였는지 표시합니다.">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data.statusStackedByDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(value: any) => numberFormat(value)} /><Legend />{statusKeys.map((key, index) => <Bar key={key} dataKey={key} name={displayLabel(key)} stackId="a" fill={COLORS[index % COLORS.length]} />)}</BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="활동량 × 활성 방" desc="x=활동량, y=활성 방 수입니다.">
          <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid /><XAxis type="number" dataKey="x" name="활동량" /><YAxis type="number" dataKey="y" name="방 수" /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter name="일자" data={data.scatter} fill="#38bdf8" /></ScatterChart></ResponsiveContainer>
        </ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="운영신청 상태"><TopList data={data.operationStatusTop} /></ChartCard>
        <ChartCard title="구인 상태 TOP"><TopList data={(data.statusDonut ?? []).map((item: any) => ({ name: item.name, count: item.value }))} /></ChartCard>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.chartHeader}><h2>최근 카카오 활동</h2><p>구인 로그, 참가신청, 운영신청을 통합해 최근 20개를 표시합니다.</p></div>
        <div className={styles.tableWrap}><table><thead><tr><th>시간</th><th>출처</th><th>액션</th><th>방</th><th>발신자</th><th>요약</th></tr></thead><tbody>{data.recentActivities.map((row: any, index: number) => <tr key={index}><td>{row.time}</td><td>{displayLabel(row.source)}</td><td>{displayLabel(row.action)}</td><td>{row.room}</td><td>{row.sender}</td><td>{row.summary}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}


