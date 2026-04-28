"use client";

import Link from "next/link";
import AuthSection from "./AuthSection";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Home,
  Users,
  Trophy,
  Swords,
  Flame,
  UserPlus,
  Scale,
  Bell,
  CalendarDays,
} from "lucide-react";

type UserStatus = "PENDING" | "APPROVED" | "REJECTED";

type User = {
  userId: string;
  status: UserStatus;
};

const menuGroups = [
  {
    title: "LOBBY",
    items: [
      { href: "/", label: "홈", icon: Home },
      { href: "/players", label: "플레이어", icon: Users },
      { href: "/rankings", label: "랭킹", icon: Trophy },
    ],
  },
  {
    title: "BATTLE",
    items: [
      { href: "/matches", label: "내전 목록", icon: Swords },
      { href: "/progress", label: "이벤트 / 멸망전", icon: Flame },
      { href: "/participation", label: "참가하기", icon: UserPlus, auth: true },
      { href: "/players/balance", label: "팀 밸런스", icon: Scale, auth: true },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/notices", label: "공지사항", icon: Bell },
      { href: "/event-notices", label: "이벤트 공지", icon: CalendarDays },
    ],
  },
];

export default function UserSidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!res.ok) {
          setUser(null);
          return;
        }

        const data: { user: User | null } = await res.json();
        setUser(data.user ?? null);
      } catch (error: unknown) {
        console.error("[USER_SIDEBAR_AUTH_ERROR]", error);
        setUser(null);
      }
    }

    fetchUser().catch((error: unknown) => {
      console.error("[USER_SIDEBAR_AUTH_PROMISE_ERROR]", error);
      setUser(null);
    });
  }, [pathname]);

  const isLoggedIn = Boolean(user);

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__top">
        <div className="app-sidebar__title">K-LOL.GG</div>

        <nav className="app-sidebar__nav">
          {menuGroups.map((group) => (
            <div key={group.title} className="app-sidebar__group">
              <div className="app-sidebar__group-title">{group.title}</div>

              <div className="app-sidebar__group-items">
                {group.items.map((item) => {
                  if (item.auth && !isLoggedIn) return null;

                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="app-sidebar__link app-sidebar__link--compact"
                    >
                      <Icon size={18} className="app-sidebar__icon" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="app-sidebar__bottom">
        <AuthSection />
      </div>
    </aside>
  );
}