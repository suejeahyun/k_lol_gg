import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Image from "next/image";
import Link from "next/link";
import { AppWindow, ExternalLink, LockKeyhole, MonitorSmartphone, ShieldCheck, Smartphone } from "@/components/theme/theme-icons";

import { InstallActions } from "./install-actions";
import styles from "../guide.module.css";

export const metadata = createRouteMetadata("/install");

export default function InstallPage() {
  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="install-title">
        <div className={styles.heroCopy}>

          <h1 id="install-title">홈 화면에 앱 설치</h1>

        </div>
        <div className={styles.heroArt}><Image src="/images/champions/lulu-card.avif" alt="파스텔 구름 사이에서 손을 흔드는 룰루 비공식 AI 팬아트" fill priority sizes="(max-width: 860px) 100vw, 38vw" /></div>
      </section>

      <section className={styles.section} aria-labelledby="browser-install-title">
        <div className={styles.sectionHeading}><div><h2 id="browser-install-title">브라우저 앱 설치</h2></div></div>
        <InstallActions />
      </section>

      <section className={styles.section} aria-labelledby="install-options-title">
        <div className={styles.sectionHeading}><div><h2 id="install-options-title">기기별 안내</h2></div></div>
        <div className={styles.cardGrid}>
          <div className={styles.card}><MonitorSmartphone size={24} aria-hidden="true" /><strong>Chrome·Edge</strong><p>설치 조건이 충족되면 위 버튼이 활성화됩니다. 버튼이 없다면 브라우저 메뉴의 ‘앱 설치’를 확인하세요.</p></div>
          <div className={styles.card}><Smartphone size={24} aria-hidden="true" /><strong>iPhone·iPad</strong><p>Safari의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요.</p></div>
          <div className={styles.card}><AppWindow size={24} aria-hidden="true" /><strong>Android</strong><p>Chrome 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.</p></div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.notice}><LockKeyhole size={19} aria-hidden="true" /><span>앱 아이콘과 공개 이미지만 기기에 저장하며, 로그인 정보와 개인 이미지는 저장하지 않습니다.</span></div>
        <div className={styles.actions}><Link className={styles.primary} href="/start"><ExternalLink size={16} aria-hidden="true" /> 사이트 시작하기</Link><Link className={styles.secondary} href="/privacy"><ShieldCheck size={16} aria-hidden="true" /> 개인정보 처리방침</Link></div>
      </section>
    </div>
  );
}
