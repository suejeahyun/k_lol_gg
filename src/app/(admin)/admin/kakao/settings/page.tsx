import { permanentRedirect } from "next/navigation";
export default function LegacyKakaoSettingsPage() { permanentRedirect("/admin/kakao?tab=settings"); }
