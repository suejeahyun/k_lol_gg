"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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

type Props = {
  data: any;
};

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
  return (
    <article className={styles.kpiCard}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? numberFormat(value) : value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function ChartCard({ title, desc, children, tall = false }: { title: string; desc?: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <section className={`${styles.chartCard} ${tall ? styles.tall : ""}`}>
      <div className={styles.chartHeader}>
        <h2>{title}</h2>
        {desc ? <p>{desc}</p> : null}
      </div>
      <div className={styles.chartBody}>{children}</div>
    </section>
  );
}

function EmptyAware({ data, children }: { data: any[]; children: React.ReactNode }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className={styles.empty}>표시할 데이터가 없습니다.</div>;
  }
  return <>{children}</>;
}

function Donut({ data }: { data: any[] }) {
  const displayData = localizeList(data ?? []);

  return (
    <EmptyAware data={displayData}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={displayData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>
            {displayData.map((_: any, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value: any) => numberFormat(value)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </EmptyAware>
  );
}

function Heatmap({ data }: { data: { day: string; hour: number; count: number }[] }) {
  const displayData = localizeList(data ?? []);
  const max = Math.max(
    1,
    ...displayData.map((item) => Number(item.count ?? 0))
  );
  const days = ["월", "화", "수", "목", "금", "토", "일"];
  return (
    <div className={styles.Heatmap}>
      <div className={styles.HeatmapGrid}>
        <span />
        {Array.from({ length: 24 }).map((_, hour) => <b key={hour}>{hour}</b>)}
        {days.map((day) => (
          <div className={styles.HeatmapRow} key={day}>
            <strong>{day}</strong>
            {Array.from({ length: 24 }).map((_, hour) => {
              const count = data.find((item) => item.day === day && item.hour === hour)?.count ?? 0;
              const level = Math.ceil((count / max) * 5);
              return <span key={`${day}-${hour}`} className={styles[`heat${level}`]} title={`${day} ${hour}시: ${count}건`} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopList({ data }: { data: { name: string; count: number }[] }) {
  const displayData = localizeList(data ?? []);
  const max = Math.max(
    1,
    ...displayData.map((item) => Number(item.count ?? 0))
  );
  return (
    <EmptyAware data={displayData}>
      <div className={styles.topList}>
        {displayData.map((item, index) => (
          <div className={styles.topRow} key={`${item.name}-${index}`}>
            <span className={styles.rank}>{index + 1}</span>
            <span className={styles.topName} title={String(item.name)}>{displayLabel(item.name)}</span>
            <div className={styles.barTrack}><i style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} /></div>
            <strong>{numberFormat(item.count)}</strong>
          </div>
        ))}
      </div>
    </EmptyAware>
  );
}

export default function AdminLogsStatsDashboard({ data }: Props) {
  const stackedKeys: string[] = data.stackedKeys ?? [];
  const radarSubjects = Array.from(new Set((data.actorRadar ?? []).map((item: any) => item.subject)));
  const radarActors = Array.from(new Set((data.actorRadar ?? []).map((item: any) => item.actor)));
  const radarData = radarSubjects.map((subject: any) => {
    const row: any = { subject };
    radarActors.forEach((actor: any) => {
      row[actor] = (data.actorRadar ?? []).find((item: any) => item.subject === subject && item.actor === actor)?.value ?? 0;
    });
    return row;
  });

  return (
    <div className={styles.dashboard}>
      {data.notice ? <div className={styles.notice}>{data.notice}</div> : null}

      <section className={styles.kpiGrid}>
        <KpiCard label="기간 내 로그" value={data.summary.total} hint={`${data.days}일 기준`} />
        <KpiCard label="최근 24시간" value={data.summary.last24h} hint="운영 작업량" />
        <KpiCard label="활성 관리자" value={data.summary.uniqueActors} hint="actor 기준" />
        <KpiCard label="작업 종류" value={data.summary.actionTypes} hint="작업 기준" />
        <KpiCard label="대상 종류" value={data.summary.대상s} hint="대상 기준" />
        <KpiCard label="전체 누적" value={data.summary.allTimeTotal} hint="AdminLog 전체" />
      </section>

      <section className={styles.gridTwoWide}>
        <ChartCard title="일자별 로그 추이" desc="막대는 일별 로그, 선은 기간 내 누적 로그입니다." tall>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: any) => numberFormat(value)} />
              <Legend />
              <Bar dataKey="count" name="일별 로그" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="cumulative" name="누적" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="작업 비율" desc="상위 작업 기준 비율입니다." tall>
          <Donut data={data.actionDonut} />
        </ChartCard>
      </section>

      <section className={styles.gridThree}>
        <ChartCard title="작업 TOP 10"><TopList data={data.actionTop} /></ChartCard>
        <ChartCard title="대상 TOP 10"><TopList data={data.targetTop} /></ChartCard>
        <ChartCard title="관리자 TOP 10"><TopList data={data.actorTop} /></ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="시간대별 로그" desc="운영이 몰리는 시간을 확인합니다.">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.hourlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" interval={2} />
              <YAxis />
              <Tooltip formatter={(value: any) => numberFormat(value)} />
              <Area type="monotone" dataKey="count" name="로그" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="대상 비율" desc="대상 기준 분포입니다.">
          <Donut data={data.targetDonut} />
        </ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="요일 × 시간대 Heatmap" desc="색이 진할수록 로그가 많은 구간입니다.">
          <Treemap data={data.Heatmap} />
        </ChartCard>
        <ChartCard title="관리자별 활동 성향" desc="상위 관리자 기준 작업 유형 분포입니다.">
          <EmptyAware data={radarData}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis />
                {radarActors.slice(0, 5).map((actor: any, index) => (
                  <Radar key={actor} name={actor} dataKey={actor} stroke={COLORS[index % COLORS.length]} fill={COLORS[index % COLORS.length]} fillOpacity={0.12} />
                ))}
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </EmptyAware>
        </ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="날짜별 작업 구성" desc="상위 작업이 날짜별로 어떻게 쌓였는지 표시합니다.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.actionStackedByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: any) => numberFormat(value)} />
              <Legend />
              {stackedKeys.map((key, index) => <Bar key={key} dataKey={key} name={displayLabel(key)} stackId="a" fill={COLORS[index % COLORS.length]} />)}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="로그 수 × 활성 관리자" desc="x=로그 수, y=고유 관리자 수입니다.">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid />
              <XAxis type="number" dataKey="x" name="로그 수" />
              <YAxis type="number" dataKey="y" name="관리자 수" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter name="일자" data={data.scatter} fill="#38bdf8" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className={styles.gridTwo}>
        <ChartCard title="IP TOP 10"><TopList data={data.ipTop} /></ChartCard>
        <ChartCard title="대상 Treemap" desc="큰 박스일수록 많이 사용된 대상입니다.">
          <EmptyAware data={data.targetTop}>
            <ResponsiveContainer width="100%" height="100%">
              <Treemap data={data.targetTop.map((item: any) => ({ name: displayLabel(item.name), size: item.count }))} dataKey="size" nameKey="name" stroke="#0f2745" fill="#38bdf8" />
            </ResponsiveContainer>
          </EmptyAware>
        </ChartCard>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.chartHeader}>
          <h2>최근 로그</h2>
          <p>최근 20개 로그를 요약 표시합니다.</p>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>시간</th><th>작업</th><th>대상</th><th>관리자</th><th>IP</th><th>요약</th></tr></thead>
            <tbody>
              {data.recentLogs.map((row: any, index: number) => (
                <tr key={`${row.id}-${index}`}><td>{row.time}</td><td>{displayLabel(row.action)}</td><td>{displayLabel(row.대상)}</td><td>{row.actor}</td><td>{row.ip}</td><td>{row.summary}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}








