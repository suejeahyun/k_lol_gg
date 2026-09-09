import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { getRuntimeKakaoRoomRegistry } from "@/modules/recruiting/kakao-access/runtime";
import styles from "../kakao.module.css";
import { KakaoRoomActions } from "./kakao-room-actions";

export const dynamic = "force-dynamic";

function formatLastSeen(value: Date | string | null) { return value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"; }

export default async function KakaoRoomsPage() {
  const session = await requirePageRole("ADMIN", "/admin/kakao/rooms"); const registry = getRuntimeKakaoRoomRegistry();
  let data: Awaited<ReturnType<NonNullable<typeof registry>["list"]>> | null = null; try { data = registry ? await registry.list() : null; } catch { data = null; }
  return <main className={styles.page}><header className={styles.header}><div><span>KAKAO · INSTALLATIONS</span><h1>카카오 방·설치본 연결</h1><p>봇 설치본 하나를 canonical 방 하나에 명시적으로 연결합니다. 카카오 알림의 room 문자열은 사용하지 않습니다.</p></div></header><nav className={styles.tabs}><Link href="/admin/kakao">연동 센터</Link><Link href="/admin/kakao/rooms" aria-current="page">방 권한</Link></nav>{data ? <section className={styles.panel}><div className={styles.panelHead}><h2>등록 방</h2><span>{session.role === "SUPER_ADMIN" ? "SUPER 수정 가능" : "읽기 전용"}</span></div><div className={styles.settingsBody}>{session.role === "SUPER_ADMIN" ? <KakaoRoomActions rooms={data.rooms}/> : <p>상태와 역할 변경, 연결 코드 발급은 SUPER 관리자만 가능합니다.</p>}<p>보안 원칙: 설치본 하나는 실제 카카오톡 방 하나에서만 실행하세요. 다른 방에는 별도 설치본을 발급해야 합니다.</p><div className={styles.tableWrap}><table><thead><tr><th>방</th><th>상태</th><th>설치본 바인딩</th><th>멤버</th></tr></thead><tbody>{data.rooms.map((room)=><tr key={room.id}><td>{room.displayName}</td><td>{room.status}</td><td>{room.bindings.map((binding)=><div key={binding.id}><code>{binding.installationHint}</code> / <code>{binding.roomHint}</code><br/><small>{binding.installationStatus} · 키 {binding.installationKeyId} · {binding.lastBotVersion ?? "버전 미확인"} · 최근 {formatLastSeen(binding.lastSeenAt)}</small></div>)}</td><td>{room.members.length}</td></tr>)}</tbody></table></div></div></section>:<section className={styles.state} role="alert"><h2>방 등록 정보를 불러오지 못했습니다.</h2><p>DB 연결과 migration 적용 상태를 확인해 주세요.</p></section>}</main>;
}
