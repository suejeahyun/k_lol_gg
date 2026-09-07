import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppWindow, ExternalLink, LockKeyhole, MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";

import { InstallActions } from "./install-actions";
import styles from "../guide.module.css";

export const metadata: Metadata = {
  title: "앱 설치",
  description: "K-LOL.GG를 데스크톱과 모바일에 안전한 웹앱으로 설치하는 방법을 확인합니다.",
  alternates: { canonical: "/install" },
};

export default function InstallPage() {
  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="install-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>INSTALL K-LOL.GG</p>
          <h1 id="install-title">어디서든 같은 화면으로<br />가볍게 열어요</h1>
          <p>데스크톱·모바일·설치형 웹앱 모두 같은 주소와 기능을 사용합니다. 개인 화면과 API 응답은 오프라인 캐시에 저장하지 않습니다.</p>
        </div>
        <div className={styles.heroArt}><Image src="/images/champions/lulu-card.avif" alt="파스텔 구름 사이에서 손을 흔드는 룰루 비공식 AI 팬아트" fill priority sizes="(max-width: 860px) 100vw, 38vw" /></div>
      </section>

      <section className={styles.section} aria-labelledby="browser-install-title">
        <div className={styles.sectionHeading}><div><h2 id="browser-install-title">브라우저 앱 설치</h2><p>지원 환경에서는 주소창과 분리된 앱 창으로 열 수 있어요.</p></div><span className={styles.statusBadge} data-ready="true"><AppWindow size={13} aria-hidden="true" /> 기기에서 확인</span></div>
        <InstallActions />
      </section>

      <section className={styles.section} aria-labelledby="install-options-title">
        <div className={styles.sectionHeading}><div><h2 id="install-options-title">기기별 안내</h2><p>자동으로 다른 모바일 주소로 보내지 않습니다.</p></div></div>
        <div className={styles.cardGrid}>
          <div className={styles.card}><MonitorSmartphone size={24} aria-hidden="true" /><strong>Chrome·Edge</strong><p>설치 조건이 충족되면 위 버튼이 활성화됩니다. 버튼이 없다면 브라우저 메뉴의 ‘앱 설치’를 확인하세요.</p></div>
          <div className={styles.card}><Smartphone size={24} aria-hidden="true" /><strong>iPhone·iPad</strong><p>Safari의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요. 별도 계정이나 앱스토어 결제는 없습니다.</p></div>
          <div className={styles.card}><AppWindow size={24} aria-hidden="true" /><strong>Android</strong><p>Chrome 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요. 별도 APK 없이 최신 사이트가 앱처럼 열립니다.</p><small>공식 설치 방식 · PWA</small></div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.notice}><LockKeyhole size={19} aria-hidden="true" /><span>설치형 웹앱의 캐시는 아이콘·manifest·공개 캐릭터 이미지와 빌드 정적 파일로 제한합니다. 로그인 화면, 관리자 화면, API와 비공개 이미지는 저장하지 않습니다.</span></div>
        <div className={styles.actions}><Link className={styles.primary} href="/start"><ExternalLink size={16} aria-hidden="true" /> 사이트 시작하기</Link><Link className={styles.secondary} href="/privacy"><ShieldCheck size={16} aria-hidden="true" /> 개인정보 처리방침</Link></div>
      </section>
    </div>
  );
}
