import Link from "next/link";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { getRuntimeKakaoRoomRegistry } from "@/modules/recruiting/kakao-access/runtime";
import styles from "../kakao.module.css";
import { KakaoRoomActions } from "./kakao-room-actions";

export const dynamic = "force-dynamic";

function formatLastSeen(value: Date | string | null) { return value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "미확인"; }

export default async function KakaoRoomsPage() {
  await requirePageRole("SUPER_ADMIN", "/admin/kakao/rooms"); const registry = getRuntimeKakaoRoomRegistry();
  let data: Awaited<ReturnType<NonNullable<typeof registry>["list"]>> | null = null; try { data = registry ? await registry.list() : null; } catch { data = null; }
  return <main className={styles.page}><header className={styles.header}><div><span>KAKAO · LEGACY INSTALLATIONS</span><h1>레거시 카카오 방·설치본 연결</h1><p>이 화면은 레거시 V2/V3 endpoint의 canonical 방 registry를 관리합니다. 현재 V1 strict R8/V4 command gateway는 한 봇 프로필로 두 방을 수신하며, raw room을 파싱하지 않고 프로필별 installation scope로 검증합니다.</p></div></header><nav className={styles.tabs}><Link href="/admin/kakao">연동 센터</Link><Link href="/admin/kakao/rooms" aria-current="page">레거시 방 권한</Link></nav>{data ? <section className={styles.panel}><div className={styles.panelHead}><h2>레거시 등록 방</h2><span>SUPER 수정 가능</span></div><div className={styles.settingsBody}><KakaoRoomActions rooms={data.rooms}/><p>레거시 보안 원칙: V2/V3 설치본 하나는 canonical 방 하나에만 연결합니다. 이 registry는 `/api/integrations/kakao/v4/commands`의 권한이나 라우팅을 변경하지 않습니다.</p><div className={styles.tableWrap}><table><thead><tr><th>방</th><th>기능</th><th>상태</th><th>설치본 바인딩</th><th>멤버</th></tr></thead><tbody>{data.rooms.map((room)=><tr key={room.id}><td>{room.displayName}</td><td>{room.capabilityProfile}</td><td>{room.status}</td><td>{room.bindings.map((binding)=><div key={binding.id}><code>{binding.installationHint}</code> / <code>{binding.roomHint}</code><br/><small>{binding.installationStatus} · 키 {binding.installationKeyId} · {binding.lastBotVersion ?? "버전 미확인"} · 최근 {formatLastSeen(binding.lastSeenAt)}</small></div>)}</td><td>{room.members.length}</td></tr>)}</tbody></table></div></div></section>:<section className={styles.state} role="alert"><h2>레거시 방 등록 정보를 불러오지 못했습니다.</h2><p>DB 연결과 migration 적용 상태를 확인해 주세요.</p></section>}</main>;
}
