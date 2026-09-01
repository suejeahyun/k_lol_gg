import {
  BarChart3,
  BookOpenCheck,
  Bot,
  Gamepad2,
  ImageIcon,
  MessageCircleMore,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import styles from "./page.module.css";

const areas = [
  { id: "accounts", title: "계정·선수", description: "승인, 역할, 선수 등록부와 Riot 연결", icon: Users, stage: "S01–S02" },
  { id: "matches", title: "경기·결과", description: "경기 생성, 결과 접수와 증거 검토", icon: Gamepad2, stage: "S04" },
  { id: "tournaments", title: "대회 운영", description: "이벤트전·멸망전의 전체 상태 전이", icon: Trophy, stage: "S07–S08" },
  { id: "balance", title: "밸런스·통계", description: "MMR, 팀 편성, 재계산과 AI 리뷰", icon: BarChart3, stage: "S05–S06" },
  { id: "community", title: "커뮤니티", description: "구인, Kakao, 운영 신청과 자동화", icon: MessageCircleMore, stage: "S09" },
  { id: "content", title: "콘텐츠", description: "챔피언, 하이라이트, 갤러리와 홈 노출", icon: ImageIcon, stage: "S10" },
  { id: "safety", title: "징계·비공개 자료", description: "증거 기반 검토와 목적별 접근 제어", icon: BookOpenCheck, stage: "S10–S11" },
  { id: "integrations", title: "외부 연동", description: "Riot·Kakao·Blob fake부터 안전하게 검증", icon: Bot, stage: "S12" },
  { id: "operations", title: "서비스 운영", description: "사이트 설정, 감사 로그, 백업과 유지보수", icon: Settings2, stage: "S13" },
];

export default async function AdminDashboardPage() {
  const session = await requirePageRole("ADMIN", "/admin");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 관리자 기반 S01</span>
          <h1>운영 흐름을 한눈에 정리해요.</h1>
          <p>V1의 81개 관리자 화면을 기능 계약별로 통합하는 V2 운영 허브입니다.</p>
        </div>
        <div className={styles.sessionCard}>
          <small>검증된 세션</small>
          <strong>{session.role}</strong>
          <span>{session.adminTotpVerified ? "2단계 인증 완료" : "2단계 인증 등록 필요"}</span>
        </div>
      </header>

      <section className={styles.notice} aria-labelledby="admin-foundation-title">
        <div><ShieldCheck aria-hidden="true" /></div>
        <div>
          <h2 id="admin-foundation-title">로그인을 우회하지 않는 검수 기반</h2>
          <p>현재 화면도 비밀번호·TOTP·서명된 HttpOnly 세션을 통과해야 열립니다. 각 운영 기능은 구현될 때 페이지와 API에서 권한을 다시 확인합니다.</p>
        </div>
      </section>

      <section className={styles.areas} aria-labelledby="admin-areas-title">
        <div className={styles.sectionHeading}>
          <div><span>기능 영역</span><h2 id="admin-areas-title">관리자 구현 지도</h2></div>
          <p>완성된 영역만 실제 작업 버튼을 활성화합니다.</p>
        </div>
        <div className={styles.grid}>
          {areas.map(({ id, title, description, icon: Icon, stage }) => (
            <article id={id} className={styles.areaCard} key={id}>
              <div className={styles.icon}><Icon aria-hidden="true" /></div>
              <span className={styles.stage}>{stage}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className={styles.pending}>구현 대기</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
